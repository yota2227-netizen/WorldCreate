"""世界エンジンの設定値。ここを書き換えれば運用を調整できます。"""
import os

# 使うモデル（役割ごと）
MODEL_SMALL = os.environ.get("WORLD_MODEL_SMALL", "claude-sonnet-5-5")      # 毎時の出来事・月報
MODEL_CHECK = os.environ.get("WORLD_MODEL_CHECK", "claude-opus-5-5")        # 矛盾チェック
MODEL_CREATOR = os.environ.get("WORLD_MODEL_CREATOR", "claude-opus-5-5")    # 6時間ごとの創造・神託
MODEL_EPOCH = os.environ.get("WORLD_MODEL_EPOCH", "claude-opus-5-5")        # 週1回の大事件と全体点検

# 料金表（USD / 100万トークン）。予算管理に使う概算値。
PRICES = {
    "claude-haiku-5-5": {"in": 0.10, "out": 0.50, "cache_read": 0.01, "cache_write": 0.125},
    "claude-sonnet-5-5": {"in": 2.00, "out": 10.00, "cache_read": 0.10, "cache_write": 2.50},
    "claude-opus-5-5": {"in": 4.00, "out": 20.00, "cache_read": 0.20, "cache_write": 5.00},
}

# 月の予算上限（USD）。これを超えるとその月は自動停止します。
MONTHLY_BUDGET_USD = float(os.environ.get("WORLD_MONTHLY_BUDGET", "90"))

# 時間の流れ：毎時1回の実行 = 世界の1日。
# 暦は世界の中でAIが定めたもの（canon/calendar.md）に合わせている：
#   1か月 = 29日 × 12か月 + 年末の無名日 2日 = 1年 350日
#   → 世界の1か月は現実の約29時間、1年は現実の約2週間半。
DAYS_PER_MONTH = 29
MONTHS_PER_YEAR = 12
NAMELESS_DAYS = 2
DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR + NAMELESS_DAYS

CREATION_EVERY_TICKS = 6     # 6時間ごとに創造
# 月報は世界の月が変わるたびに書く（無名日の2日間も1回の報告にまとめる）
EPOCH_EVERY_TICKS = 168      # 1週間ごとに大事件と点検

# 創造の段階。min/max は「その段階で行う創造回数」の下限・上限。
PHASES = {
    1: {"name": "法則の創造", "min": 6, "max": 12,
        "goal": "この世界の物理法則と魔法（不思議な力）の仕組みを定める。力の源、働き方、代償、限界、時間・天体・元素のあり方。まだ大地も生命もない。"},
    2: {"name": "大地の創造", "min": 8, "max": 16,
        "goal": "法則に従って大地・海・山脈・気候・魔力の濃淡を作る。地域(regions)を地図座標つきで少しずつ増やす。まだ生命はいない。"},
    3: {"name": "生命の創造", "min": 8, "max": 16,
        "goal": "その法則と環境の中で進化した植物・動物・魔獣・精霊などを生み出す。生態系のつながりと分布を決める。まだ知的種族はいない。"},
    4: {"name": "種族と文明の誕生", "min": 8, "max": 16,
        "goal": "知的種族を生み、言語・信仰・暮らし・最初の集落や国を作る。暦の名前を決めてもよい。"},
    5: {"name": "歴史の時代", "min": None, "max": None,
        "goal": "世界は自ら動き出した。発見、交易、争い、英雄、災厄、新しい魔法などを通して歴史を進める。新しい地域・生物・種族を加えてもよい。"},
}

# 聖典（設定資料）のファイル
CANON_FILES = {
    "glossary": "用語辞典",
    "laws": "法則と魔法",
    "geography": "大地と気候",
    "life": "生命",
    "peoples": "種族と文明",
    "history": "歴史の要約",
    "calendar": "暦と天体",
}

# 数値データの種類
COLLECTIONS = ["regions", "species", "peoples", "settlements", "magic"]
