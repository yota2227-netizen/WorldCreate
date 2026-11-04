"""動作確認用の模擬AI（WORLD_MOCK=1 のとき使われる）。APIを呼ばず、それらしいデータを返す。"""
import random
import re

_rng = random.Random(7)
TERRAINS = ["ocean", "sea", "plains", "forest", "mountains", "desert", "tundra", "swamp", "volcano", "crystal_field"]


def _phase(ctx):
    m = re.search(r"第(\d)期", ctx)
    return int(m.group(1)) if m else 1


def respond(tool, ctx):
    ph = _phase(ctx)
    n = _rng.randint(1000, 9999)
    if tool == "create_step":
        ops = []
        if ph >= 2:
            for _ in range(6):
                rid = f"region-{_rng.randint(1, 60)}"
                t = _rng.choice(TERRAINS)
                ops.append({"collection": "regions", "op": "upsert", "item": {
                    "id": rid, "name": f"模擬の地{rid[-2:]}", "x": round(_rng.random(), 3), "y": round(_rng.random(), 3),
                    "terrain": t, "elevation": round(_rng.random(), 2), "magic": round(_rng.random(), 2),
                    "climate": "温暖", "description": f"{t}が広がる模擬の土地。"}})
        if ph >= 3:
            ops.append({"collection": "species", "op": "upsert", "item": {
                "id": f"sp-{n}", "name": f"模擬獣{n}", "kind": _rng.choice(["動物", "植物", "魔獣", "精霊"]),
                "habitat": ["region-1"], "description": "模擬の生き物。"}})
        if ph >= 4:
            ops.append({"collection": "peoples", "op": "upsert", "item": {
                "id": "people-1", "name": "模擬の民", "population": _rng.randint(100, 5000), "description": "模擬の種族。"}})
            ops.append({"collection": "settlements", "op": "upsert", "item": {
                "id": f"town-{n % 7}", "name": f"模擬の町{n % 7}", "people": "people-1", "region": "region-1",
                "x": round(_rng.random(), 3), "y": round(_rng.random(), 3), "size": _rng.randint(1, 3)}})
        if ph == 1:
            ops.append({"collection": "magic", "op": "upsert", "item": {
                "id": f"magic-{n % 4}", "name": f"模擬の理{n % 4}", "description": "模擬の魔法法則。"}})
        return {
            "narrative": f"（模擬）第{ph}期の創造が一歩進んだ。番号{n}。",
            "canon_edits": [{"file": ["laws", "geography", "life", "peoples", "history"][min(ph, 5) - 1],
                             "mode": "append", "content": f"- 模擬の設定 {n}"}],
            "data_ops": ops,
            "timeline": [{"title": f"模擬の出来事{n}", "summary": "模擬", "importance": 2}] if n % 2 else [],
            "world_name": "模擬界" if ph == 1 else None,
            "phase_complete": True,
        }
    if tool == "record_day":
        return {"events": [{"title": f"小さな出来事{n}", "text": "模擬の一日。", "region_id": "region-1",
                            "importance": _rng.randint(1, 3)}], "data_ops": []}
    if tool == "report_check":
        return {"ok": n % 5 != 0, "problems": [] if n % 5 else ["模擬の矛盾"]}
    if tool == "write_report":
        return {"headline": f"模擬月報{n}", "article": "## 今月の出来事\n模擬の記事。"}
    raise ValueError(tool)
