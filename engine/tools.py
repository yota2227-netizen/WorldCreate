"""AIに答えさせる形式（ツール定義）。"""
import settings as S

_DATA_OP = {
    "type": "object",
    "properties": {
        "collection": {"type": "string", "enum": S.COLLECTIONS},
        "op": {"type": "string", "enum": ["upsert", "remove"]},
        "item": {"type": "object", "description": "id は必須。upsert は既存項目に指定フィールドを上書きで統合する。"},
    },
    "required": ["collection", "op", "item"],
}

_CANON_EDIT = {
    "type": "object",
    "properties": {
        "file": {"type": "string", "enum": list(S.CANON_FILES)},
        "mode": {"type": "string", "enum": ["append", "replace"]},
        "content": {"type": "string", "description": "Markdown。append は末尾に追記、replace はファイル全体を置き換え。"},
    },
    "required": ["file", "mode", "content"],
}

_TIMELINE = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "summary": {"type": "string"},
        "importance": {"type": "integer", "minimum": 1, "maximum": 3},
    },
    "required": ["title", "summary", "importance"],
}

CREATE = {
    "name": "create_step",
    "description": "世界の創造を一歩進め、その結果を記録する。",
    "input_schema": {
        "type": "object",
        "properties": {
            "narrative": {"type": "string", "description": "今回の創造を物語る記録（創世記の一節のような文体、300〜800字）"},
            "canon_edits": {"type": "array", "items": _CANON_EDIT},
            "data_ops": {"type": "array", "items": _DATA_OP},
            "timeline": {"type": "array", "items": _TIMELINE, "description": "年表に残すべき出来事（なければ空）"},
            "world_name": {"type": "string", "description": "世界の名前を決めた/変えた場合のみ"},
            "month_names": {"type": "array", "items": {"type": "string"}, "description": f"暦の月名を決めた場合のみ（{S.MONTHS_PER_YEAR}個）"},
            "phase_complete": {"type": "boolean", "description": "現在の創造段階の目標が十分に満たされたと判断したら true"},
        },
        "required": ["narrative", "canon_edits", "data_ops", "timeline", "phase_complete"],
    },
}

EVENTS = {
    "name": "record_day",
    "description": "世界の1日に起きた小さな出来事を記録する。",
    "input_schema": {
        "type": "object",
        "properties": {
            "events": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "title": {"type": "string"},
                        "text": {"type": "string", "description": "60〜200字"},
                        "region_id": {"type": "string"},
                        "importance": {"type": "integer", "minimum": 1, "maximum": 3},
                    },
                    "required": ["title", "text", "importance"],
                },
            },
            "data_ops": {"type": "array", "items": _DATA_OP, "description": "人口の増減など小さな数値変化のみ。なければ空。"},
        },
        "required": ["events", "data_ops"],
    },
}

CHECK = {
    "name": "report_check",
    "description": "新しい創造が既存の聖典と矛盾していないかの判定結果。",
    "input_schema": {
        "type": "object",
        "properties": {
            "ok": {"type": "boolean"},
            "problems": {"type": "array", "items": {"type": "string"}},
        },
        "required": ["ok", "problems"],
    },
}

REPORT = {
    "name": "write_report",
    "description": "世界の1か月分の出来事をまとめた月報（新聞）を書く。",
    "input_schema": {
        "type": "object",
        "properties": {
            "headline": {"type": "string"},
            "article": {"type": "string", "description": "Markdown。見出しと記事3〜5本程度、合計800〜1500字。"},
        },
        "required": ["headline", "article"],
    },
}
