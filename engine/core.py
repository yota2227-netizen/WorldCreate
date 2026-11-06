"""世界の状態の読み書き、AI呼び出し、予算管理などの共通処理。"""
import datetime as dt
import json
import os
import re
from pathlib import Path

import settings as S

ROOT = Path(__file__).resolve().parent.parent
WORLD = ROOT / "world"
PROMPTS = ROOT / "engine" / "prompts"
ORACLE_FILE = ROOT / "oracle.md"

ORACLE_TEMPLATE = """<!--
ここは「神託」の窓口です。
この注意書きの下に、世界へ伝えたい一言を書いて保存（コミット）してください。
数分以内にAIが目覚め、その言葉を世界の出来事として織り込みます。
例：「北の海に、誰も見たことのない島を浮かべよ」
反映されると、この欄は自動で空に戻り、内容は world/oracles.json に記録されます。
-->
"""


# ---------- 汎用 ----------
def read_json(path, default):
    p = WORLD / path if not Path(path).is_absolute() else Path(path)
    if not p.exists():
        return default
    return json.loads(p.read_text(encoding="utf-8"))


def write_json(path, data):
    p = WORLD / path
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def prompt(name):
    return (PROMPTS / f"{name}.md").read_text(encoding="utf-8")


# ---------- 状態と暦 ----------
DEFAULT_STATE = {
    "tick": 0,
    "phase": 1,
    "phase_creations": 0,
    "creation_count": 0,
    "world_name": None,
    "month_names": None,
}


def load_state():
    st = dict(DEFAULT_STATE)
    st.update(read_json("state.json", {}))
    return st


def save_state(st):
    write_json("state.json", st)


def world_date(tick):
    """tick（経過日数、0起点）を世界の暦 (年, 月, 日) に変換。無名日は月=13。"""
    y = tick // S.DAYS_PER_YEAR + 1
    doy = tick % S.DAYS_PER_YEAR
    months_days = S.DAYS_PER_MONTH * S.MONTHS_PER_YEAR
    if doy < months_days:
        return y, doy // S.DAYS_PER_MONTH + 1, doy % S.DAYS_PER_MONTH + 1
    return y, S.MONTHS_PER_YEAR + 1, doy - months_days + 1


def month_name(st, m):
    if m > S.MONTHS_PER_YEAR:
        return "無名日"
    names = st.get("month_names")
    return names[m - 1] if names and len(names) >= m else f"{m}月"


def date_label(st, tick=None):
    tick = st["tick"] if tick is None else tick
    y, m, d = world_date(tick)
    if m > S.MONTHS_PER_YEAR:
        return f"創世暦{y}年 無名{'一二三四五'[d - 1]}日"
    return f"創世暦{y}年 {month_name(st, m)} {d}日"


def month_key(tick):
    y, m, _ = world_date(tick)
    return f"Y{y:04d}-M{m:02d}"


def month_range(tick):
    """tick を含む月（または無名日の期間）の [開始tick, 終了tick) を返す。"""
    y, m, d = world_date(tick)
    start = tick - (d - 1)
    length = S.DAYS_PER_MONTH if m <= S.MONTHS_PER_YEAR else S.NAMELESS_DAYS
    return start, start + length


def phase_info(st):
    return S.PHASES[st["phase"]]


# ---------- 聖典と数値データ ----------
def canon_text():
    parts = []
    for key, title in S.CANON_FILES.items():
        p = WORLD / "canon" / f"{key}.md"
        body = p.read_text(encoding="utf-8").strip() if p.exists() else ""
        parts.append(f"## 【{title}】 (canon/{key}.md)\n{body or '（まだ何も定められていない）'}")
    return "\n\n".join(parts)


def load_collection(name):
    return read_json(f"data/{name}.json", [])


def data_summary(detail=True, limit=90):
    """数値データをAIに渡すための要約。"""
    out = {}
    for c in S.COLLECTIONS:
        items = load_collection(c)
        rows = []
        for it in items:
            row = dict(it)
            if "description" in row and isinstance(row["description"], str):
                d = row["description"]
                row["description"] = d if detail and len(d) <= limit else d[:limit] + "…"
            rows.append(row)
        out[c] = rows
    return json.dumps(out, ensure_ascii=False)


def apply_canon_edits(edits):
    applied = []
    for e in edits or []:
        key = str(e.get("file", "")).replace("canon/", "").replace(".md", "")
        if key not in S.CANON_FILES:
            continue
        p = WORLD / "canon" / f"{key}.md"
        p.parent.mkdir(parents=True, exist_ok=True)
        content = str(e.get("content", "")).strip()
        if not content:
            continue
        if e.get("mode") == "replace":
            p.write_text(content + "\n", encoding="utf-8")
        else:
            old = p.read_text(encoding="utf-8").rstrip() if p.exists() else ""
            p.write_text((old + "\n\n" + content).strip() + "\n", encoding="utf-8")
        applied.append(key)
    return applied


def apply_data_ops(ops):
    changed = set()
    cache = {}
    for op in ops or []:
        c = op.get("collection")
        item = op.get("item") or {}
        if c not in S.COLLECTIONS or not item.get("id"):
            continue
        items = cache.setdefault(c, load_collection(c))
        idx = next((i for i, x in enumerate(items) if x.get("id") == item["id"]), None)
        if op.get("op") == "remove":
            if idx is not None:
                items.pop(idx)
        elif idx is None:
            items.append(item)
        else:
            merged = dict(items[idx])
            merged.update(item)
            items[idx] = merged
        changed.add(c)
    for c in changed:
        write_json(f"data/{c}.json", cache[c])
    return sorted(changed)


# ---------- 未解決の謎 ----------
MYST_HEAD = "# 未解決の謎\nこの世界でまだ答えの出ていない問い。創造や時代の節目で、ふさわしい時に答えが明かされる。\n"


def _mysteries():
    p = WORLD / "canon" / "mysteries.md"
    open_, solved = [], []
    if p.exists():
        sec = None
        for line in p.read_text(encoding="utf-8").splitlines():
            if line.startswith("## まだ"):
                sec = open_
            elif line.startswith("## 解き"):
                sec = solved
            elif line.startswith("- ") and sec is not None:
                sec.append(line)
            elif line.startswith("  ") and sec:
                sec[-1] += "\n" + line
    return open_, solved


def _save_mysteries(open_, solved):
    body = MYST_HEAD + "\n## まだ答えの出ていない謎\n" + ("\n".join(open_) or "（いまはない）") + \
        "\n\n## 解き明かされた謎\n" + ("\n".join(solved) or "（まだない）") + "\n"
    (WORLD / "canon").mkdir(parents=True, exist_ok=True)
    (WORLD / "canon" / "mysteries.md").write_text(body, encoding="utf-8")


def add_mysteries(st, questions):
    questions = [q.strip() for q in (questions or []) if q and q.strip()]
    if not questions:
        return
    open_, solved = _mysteries()
    nums = [int(n) for n in re.findall(r"謎-(\d+)", "\n".join(open_ + solved))]
    n = max(nums, default=0)
    for q in questions[:3]:
        n += 1
        open_.append(f"- **謎-{n:03d}**：{q}（記録：{date_label(st)}）")
    _save_mysteries(open_, solved)
    print(f"  未解決の謎を {len(questions[:3])} 件記録")


def resolve_mysteries(st, resolved):
    if not resolved:
        return
    open_, solved = _mysteries()
    for r in resolved:
        mid = str(r.get("id", "")).strip()
        hit = next((l for l in open_ if f"**{mid}**" in l), None)
        if not hit:
            continue
        open_.remove(hit)
        q = re.sub(r"（記録：.*?）$", "", hit.split("**：", 1)[-1])
        solved.append(f"- **{mid}**：{q}\n  - → {r.get('answer', '').strip()}（解決：{date_label(st)}）")
        print(f"  {mid} が解かれた")
    _save_mysteries(open_, solved)


# ---------- 記録 ----------
def add_events(st, events):
    key = month_key(st["tick"])
    log = read_json(f"log/{key}.json", [])
    for e in events or []:
        log.append({
            "tick": st["tick"], "date": date_label(st),
            "title": e.get("title", ""), "text": e.get("text", ""),
            "region": e.get("region_id"), "importance": int(e.get("importance", 1) or 1),
        })
    write_json(f"log/{key}.json", log)


def recent_events(n=30):
    files = sorted((WORLD / "log").glob("*.json"))
    events = []
    for f in reversed(files):
        events = json.loads(f.read_text(encoding="utf-8")) + events
        if len(events) >= n:
            break
    return events[-n:]


def add_timeline(st, entries, kind="history"):
    tl = read_json("timeline.json", [])
    for e in entries or []:
        tl.append({
            "tick": st["tick"], "date": date_label(st), "kind": kind,
            "title": e.get("title", ""), "summary": e.get("summary", ""),
            "importance": int(e.get("importance", 2) or 2),
        })
    write_json("timeline.json", tl)


def add_creation(st, kind, narrative, extra=None):
    y, _, _ = world_date(st["tick"])
    path = f"creations/Y{y:04d}.json"
    rec = read_json(path, [])
    entry = {"tick": st["tick"], "date": date_label(st), "kind": kind,
             "phase": st["phase"], "phase_name": phase_info(st)["name"], "narrative": narrative}
    if extra:
        entry.update(extra)
    rec.append(entry)
    write_json(path, rec)


def recent_creations(n=3):
    files = sorted((WORLD / "creations").glob("*.json"))
    out = []
    for f in reversed(files):
        out = json.loads(f.read_text(encoding="utf-8")) + out
        if len(out) >= n:
            break
    return out[-n:]


def relabel_dates(st):
    """月名などが変わったとき、過去の記録の日付表記を現在の暦にそろえる。"""
    def fix(path):
        p = WORLD / path
        if not p.exists():
            return
        rows = json.loads(p.read_text(encoding="utf-8"))
        changed = False
        for r in rows:
            if isinstance(r, dict) and "tick" in r:
                lbl = date_label(st, r["tick"])
                if r.get("date") != lbl:
                    r["date"] = lbl
                    changed = True
        if changed:
            write_json(path, rows)
    for sub in ("log", "creations"):
        for f in (WORLD / sub).glob("*.json"):
            fix(f"{sub}/{f.name}")
    fix("timeline.json")
    fix("oracles.json")


def build_index(st):
    """ビューアが読む目次ファイルを作る。"""
    idx = {
        "updated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "world_name": st.get("world_name"),
        "date": date_label(st),
        "tick": st["tick"],
        "phase": st["phase"],
        "phase_name": phase_info(st)["name"],
        "creation_count": st["creation_count"],
        "next_creation_in": S.CREATION_EVERY_TICKS - (st["tick"] % S.CREATION_EVERY_TICKS),
        "creation_every": S.CREATION_EVERY_TICKS,
        "reports": sorted(p.stem for p in (WORLD / "chronicle").glob("*.md")),
        "logs": sorted(p.stem for p in (WORLD / "log").glob("*.json")),
        "creations": sorted(p.stem for p in (WORLD / "creations").glob("*.json")),
        "canon": list(S.CANON_FILES.items()),
        "month_names": st.get("month_names"),
        "usage": read_json("usage.json", {}),
    }
    write_json("index.json", idx)


# ---------- 神託 ----------
def read_oracle():
    if not ORACLE_FILE.exists():
        return ""
    text = ORACLE_FILE.read_text(encoding="utf-8")
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    return text.strip()


def clear_oracle():
    ORACLE_FILE.write_text(ORACLE_TEMPLATE, encoding="utf-8")


def archive_oracle(st, text, response):
    arc = read_json("oracles.json", [])
    arc.append({"tick": st["tick"], "date": date_label(st), "oracle": text, "response": response,
                "received_at": dt.datetime.now(dt.timezone.utc).isoformat()})
    write_json("oracles.json", arc)


# ---------- 予算 ----------
def this_month():
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m")


def usage():
    u = read_json("usage.json", {})
    if u.get("month") != this_month():
        hist = u.get("history", [])
        if u.get("month"):
            hist.append({"month": u["month"], "cost_usd": round(u.get("cost_usd", 0), 4)})
        u = {"month": this_month(), "cost_usd": 0.0, "calls": 0, "by_model": {}, "history": hist[-24:]}
    return u


def budget_left():
    return S.MONTHLY_BUDGET_USD - usage()["cost_usd"]


def record_usage(model, u):
    price = S.PRICES.get(model, {"in": 0, "out": 0, "cache_read": 0, "cache_write": 0})
    cost = (
        (u.get("input_tokens") or 0) * price["in"]
        + (u.get("output_tokens") or 0) * price["out"]
        + (u.get("cache_read_input_tokens") or 0) * price["cache_read"]
        + (u.get("cache_creation_input_tokens") or 0) * price["cache_write"]
    ) / 1_000_000
    data = usage()
    data["cost_usd"] = round(data["cost_usd"] + cost, 6)
    data["calls"] += 1
    bm = data["by_model"].setdefault(model, {"calls": 0, "cost_usd": 0.0})
    bm["calls"] += 1
    bm["cost_usd"] = round(bm["cost_usd"] + cost, 6)
    write_json("usage.json", data)
    return cost


# ---------- AI呼び出し ----------
class BudgetExceeded(Exception):
    pass


def call_tool(model, system_role, context, tool, max_tokens):
    """AIに指定ツールの形式で答えさせ、その中身(dict)を返す。"""
    if os.environ.get("WORLD_MOCK"):
        import mock
        return mock.respond(tool["name"], context)

    if budget_left() <= 0:
        raise BudgetExceeded(f"今月の予算 {S.MONTHLY_BUDGET_USD} USD に達しました")

    import anthropic
    client = anthropic.Anthropic(max_retries=4)
    system = [
        {"type": "text", "text": system_role},
        {"type": "text", "text": "# 世界の聖典（これまでに定められた設定）\n\n" + canon_text(),
         "cache_control": {"type": "ephemeral"}},
    ]
    instruction = (f"\n\n【回答方法】考えがまとまったら、必ず {tool['name']} ツールを1回だけ呼び出して回答すること。"
                   "ツールを使わずに文章だけで答えてはいけない。")
    kwargs = dict(model=model, max_tokens=max_tokens, system=system,
                  messages=[{"role": "user", "content": context + instruction}], tools=[tool])

    for attempt in range(3):
        forced = model not in _NO_FORCED_TOOL
        try:
            choice = {"type": "tool", "name": tool["name"]} if forced else {"type": "auto"}
            resp = client.messages.create(tool_choice=choice, **kwargs)
        except anthropic.BadRequestError as e:
            # 一部のモデルは「ツールの強制」に非対応。その場合は自由回答＋指示で頼む
            if forced and "tool_choice" in str(e):
                _NO_FORCED_TOOL.add(model)
                continue
            raise
        cost = record_usage(model, resp.usage.model_dump())
        print(f"  [{model}] in={resp.usage.input_tokens} out={resp.usage.output_tokens} "
              f"${cost:.4f} stop={resp.stop_reason}")
        for block in resp.content:
            if block.type == "tool_use" and block.name == tool["name"] and isinstance(block.input, dict):
                return block.input
        print("  ツール形式の回答が得られなかったため再依頼します")
    raise RuntimeError("AIがツール形式で回答しませんでした")


_NO_FORCED_TOOL = set()
