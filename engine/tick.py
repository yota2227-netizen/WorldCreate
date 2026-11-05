"""世界を動かす入口。

  python engine/tick.py auto     毎時の自動実行（世界の1日を進め、必要に応じて創造・月報・大事件）
  python engine/tick.py oracle   神託だけを反映する
  python engine/tick.py create   創造を1回だけ行う（手動）
  python engine/tick.py report   直近の月報を書く（手動）
  python engine/tick.py epoch    大事件と全体点検を行う（手動）
"""
import json
import sys

import core as C
import settings as S
import tools as T


# ---------- 文脈づくり ----------
def base_context(st):
    ph = C.phase_info(st)
    return (
        f"# 現在の状況\n"
        f"- 世界の名前: {st.get('world_name') or '（まだない）'}\n"
        f"- 世界の日付: {C.date_label(st)}（経過 {st['tick']} 日）\n"
        f"- 創造の段階: 第{st['phase']}期「{ph['name']}」（この段階での創造 {st['phase_creations']} 回目まで完了）\n"
        f"- この段階の目標: {ph['goal']}\n"
    )


def creations_context(n=3):
    rec = C.recent_creations(n)
    if not rec:
        return "（まだ何も創られていない。これが最初の創造である）"
    return "\n\n".join(f"### {r['date']}（{r['phase_name']}）\n{r['narrative']}" for r in rec)


def events_context(n=30):
    ev = C.recent_events(n)
    if not ev:
        return "（まだ記録はない）"
    return "\n".join(f"- {e['date']} 【{e['title']}】{e['text']}" for e in ev)


# ---------- 創造 ----------
def apply_creation(st, res, kind):
    C.apply_canon_edits(res.get("canon_edits"))
    C.apply_data_ops(res.get("data_ops"))
    C.add_timeline(st, res.get("timeline"), kind="creation" if st["phase"] < 5 else "history")
    if res.get("world_name"):
        st["world_name"] = res["world_name"]
    mn = res.get("month_names")
    if isinstance(mn, list) and len(mn) == S.MONTHS_PER_YEAR:
        st["month_names"] = mn
    C.add_creation(st, kind, res.get("narrative", ""))


def advance_phase(st, complete_flag):
    ph = C.phase_info(st)
    if st["phase"] >= 5:
        return
    st["phase_creations"] += 1
    n = st["phase_creations"]
    if (complete_flag and n >= ph["min"]) or n >= ph["max"]:
        st["phase"] += 1
        st["phase_creations"] = 0
        nxt = C.phase_info(st)
        C.add_timeline(st, [{"title": f"第{st['phase']}期「{nxt['name']}」の始まり",
                             "summary": nxt["goal"], "importance": 3}], kind="phase")
        print(f"  → 第{st['phase']}期「{nxt['name']}」へ移行")


def run_create(st, oracle_text=None):
    kind = "oracle" if oracle_text else "creation"
    print(f"[創造] {C.date_label(st)} 第{st['phase']}期 ({kind})")
    ctx = (
        base_context(st)
        + "\n# 直近の創造の記録\n" + creations_context(3)
        + "\n\n# 直近の出来事\n" + events_context(20)
        + "\n\n# 現在の数値データ\n" + C.data_summary()
    )
    if oracle_text:
        ctx += f"\n\n# 神託（観測者から届いた言葉）\n「{oracle_text}」\nこの神託を、世界の法則と矛盾しない形で今回の創造に織り込むこと。"
    ctx += "\n\n上の状況を踏まえ、創造を一歩だけ進めてください。"

    role = C.prompt("creator")
    res = C.call_tool(S.MODEL_CREATOR, role, ctx, T.CREATE, 16000)

    # 検証係による矛盾チェック（1回だけ差し戻し可）
    check_ctx = (
        base_context(st)
        + "\n# 今回提案された創造\n" + json.dumps(res, ensure_ascii=False)
        + "\n\n# 現在の数値データ\n" + C.data_summary(detail=False)
    )
    chk = C.call_tool(S.MODEL_SMALL, C.prompt("checker"), check_ctx, T.CHECK, 3000)
    if not chk.get("ok") and chk.get("problems"):
        print("  検証係が差し戻し:", chk["problems"])
        retry_ctx = ctx + "\n\n# 検証係からの指摘（前回の案はこの理由で差し戻された）\n" + \
            "\n".join(f"- {p}" for p in chk["problems"]) + "\n指摘を解消した案を出し直してください。"
        res = C.call_tool(S.MODEL_CREATOR, role, retry_ctx, T.CREATE, 16000)

    apply_creation(st, res, kind)
    st["creation_count"] += 1
    advance_phase(st, bool(res.get("phase_complete")))
    return res


# ---------- 毎日の小さな出来事 ----------
def run_day(st):
    print(f"[一日] {C.date_label(st)}")
    ctx = (
        base_context(st)
        + "\n# 直近の創造の記録\n" + creations_context(1)
        + "\n\n# 直近の出来事\n" + events_context(15)
        + "\n\n# 現在の数値データ（概要）\n" + C.data_summary(detail=False, limit=40)
        + "\n\nこの日に起きた小さな出来事を記録してください。"
    )
    res = C.call_tool(S.MODEL_SMALL, C.prompt("daily"), ctx, T.EVENTS, 4000)
    C.add_events(st, res.get("events"))
    C.apply_data_ops(res.get("data_ops"))


# ---------- 月報 ----------
def run_report(st, any_tick_in_month):
    start, end = C.month_range(any_tick_in_month)
    key = C.month_key(start)
    log = C.read_json(f"log/{key}.json", [])
    y, m, _ = C.world_date(start)
    mname = C.month_name(st, m)
    print(f"[月報] {key}（出来事 {len(log)} 件）")
    tl = [t for t in C.read_json("timeline.json", []) if start <= t["tick"] < end]
    period = f"創世暦{y}年 {mname}" + ("（年末の名前のない2日間）" if m > S.MONTHS_PER_YEAR else "")
    ctx = (
        base_context(st)
        + f"\n# 対象: {period}\n"
        + "\n# この期間の出来事\n" + ("\n".join(f"- {e['date']} 【{e['title']}】{e['text']}" for e in log) or "（記録なし）")
        + "\n\n# この期間に年表へ刻まれたこと\n" + ("\n".join(f"- {t['title']}: {t['summary']}" for t in tl) or "（なし）")
        + "\n\n# 直近の創造の記録\n" + creations_context(5)
        + "\n\nこの期間をまとめた月報を書いてください。"
    )
    res = C.call_tool(S.MODEL_SMALL, C.prompt("reporter"), ctx, T.REPORT, 6000)
    path = C.WORLD / "chronicle" / f"{key}.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"# {res.get('headline', '')}\n\n*{period}*\n\n{res.get('article', '')}\n", encoding="utf-8")


# ---------- 大事件と全体点検 ----------
def run_epoch(st):
    print(f"[時代の節目] {C.date_label(st)}")
    tl = C.read_json("timeline.json", [])[-40:]
    ctx = (
        base_context(st)
        + "\n# 年表（直近）\n" + "\n".join(f"- {t['date']} {t['title']}: {t['summary']}" for t in tl)
        + "\n\n# 直近の創造の記録\n" + creations_context(6)
        + "\n\n# 直近の出来事\n" + events_context(60)
        + "\n\n# 現在の数値データ\n" + C.data_summary()
        + "\n\n世界全体を点検し、時代の節目となる創造を行ってください。"
    )
    res = C.call_tool(S.MODEL_EPOCH, C.prompt("epoch"), ctx, T.CREATE, 20000)
    apply_creation(st, res, "epoch")
    st["creation_count"] += 1
    advance_phase(st, bool(res.get("phase_complete")))


# ---------- 実行モード ----------
def do_oracle(st):
    text = C.read_oracle()
    if not text:
        print("神託はありません")
        return False
    res = run_create(st, oracle_text=text[:2000])
    C.archive_oracle(st, text, res.get("narrative", ""))
    C.clear_oracle()
    return True


def do_auto(st):
    # 最初の一回は、まず天地創造から
    if st["creation_count"] == 0:
        run_create(st)
    do_oracle(st)

    run_day(st)          # 今日の出来事を記録して
    st["tick"] += 1      # 一日を進める
    if st["tick"] % S.CREATION_EVERY_TICKS == 0:
        run_create(st)
    if C.world_date(st["tick"])[2] == 1:      # 新しい月（または無名日）に入った
        run_report(st, st["tick"] - 1)        # → 終わったばかりの月の月報
    if st["tick"] % S.EPOCH_EVERY_TICKS == 0:
        run_epoch(st)


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "auto"
    st = C.load_state()
    try:
        if mode == "auto":
            do_auto(st)
        elif mode == "oracle":
            do_oracle(st)
        elif mode == "create":
            run_create(st)
        elif mode == "report":
            run_report(st, st["tick"])
        elif mode == "epoch":
            run_epoch(st)
        else:
            sys.exit(f"不明なモード: {mode}")
    except C.BudgetExceeded as e:
        print("予算上限のため停止:", e)
    finally:
        C.save_state(st)
        C.relabel_dates(st)
        C.build_index(st)
        print(f"完了: {C.date_label(st)} / 今月の使用額 ${C.usage()['cost_usd']:.4f}")


if __name__ == "__main__":
    main()
