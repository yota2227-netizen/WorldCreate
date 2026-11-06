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
        "file": {"type": "string", "enum": S.EDITABLE_CANON},
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
            "narrative": {"type": "string", "description": "この創造で世界に加わったものを紹介する読み物（300〜600字）。指示書の「文章のルール」に従う。"},
            "canon_edits": {"type": "array", "items": _CANON_EDIT},
            "data_ops": {"type": "array", "items": _DATA_OP},
            "timeline": {"type": "array", "items": _TIMELINE, "description": "年表に残すべき出来事（なければ空）"},
            "world_name": {"type": "string", "description": "世界の名前を決めた/変えた場合のみ"},
            "month_names": {"type": "array", "items": {"type": "string"}, "description": f"暦の月名を決めた場合のみ（{S.MONTHS_PER_YEAR}個）"},
            "phase_complete": {"type": "boolean", "description": "現在の創造段階の目標が十分に満たされたと判断したら true"},
            "resolved_mysteries": {
                "type": "array",
                "description": "今回の創造で答えを出した「未解決の謎」。答えの中身は canon_edits で該当する聖典に書いたうえで報告する。なければ空。",
                "items": {"type": "object", "properties": {
                    "id": {"type": "string", "description": "謎の番号（例：謎-003）"},
                    "answer": {"type": "string", "description": "答えの要約（一〜二文）"}},
                    "required": ["id", "answer"]},
            },
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
            "questions": {"type": "array", "items": {"type": "string"},
                          "description": "矛盾ではないが、この創造で新たに生まれた・浮かび上がった未解決の疑問（0〜3件）。既に「未解決の謎」にあるものは書かない。"},
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
