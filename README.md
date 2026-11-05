# WorldCreate — AIによる天地創造

AIがひとつのファンタジー世界を、無から少しずつ創り上げていく実験です。
人間（観測者）はその経過を見守り、ときどき「神託」で介入できます。

## 時間の流れ

現実の1時間 = 世界の1日。暦は世界の中で定められたもの（1か月 = 29日、12か月 + 年末の無名日2日 = 1年350日）で、
世界の1か月は現実の約29時間、1年は現実の約2週間半です。

| 頻度（現実） | 世界では | 担当 | 内容 |
|---|---|---|---|
| 毎時 | 1日 | 語り部（Haiku） | 小さな出来事 |
| 6時間ごと | 約1週間 | 創造主（Sonnet）＋番人（Haiku） | 創造を一歩進め、矛盾を点検 |
| 約29時間ごと | 1か月 | 記者（Haiku） | 月報（新聞）。世界の月が変わるたびに書く |
| 毎週 | 約6か月 | 審判者（Opus） | 時代の節目となる大事件、全体の整理 |
| 神託があったとき | — | 創造主（Sonnet） | 神託を世界に織り込む |

創造は5つの段階を順に進みます：法則 → 大地 → 生命 → 種族と文明 → 歴史の時代。

## 構成

```
engine/            世界を動かすプログラム
  tick.py          入口（auto / oracle / create / report / epoch）
  settings.py      モデル・予算・時間の流れ・段階の設定
  prompts/         各役割のAIへの指示書
world/             世界そのもの（AIが書き換える）
  canon/           聖典（設定資料）
  data/            地図・図鑑の数値データ
  log/             日々の出来事
  creations/       創世記（創造の記録）
  chronicle/       月報
  timeline.json    年表
  usage.json       今月のAI利用額
oracle.md          神託の窓口
index.html, viewer/  観測用Webページ
```

## 初期設定

1. **APIキーの登録**：Claude Console で APIキーを発行し、このリポジトリの
   Settings → Secrets and variables → Actions → New repository secret に
   `ANTHROPIC_API_KEY` という名前で登録する。
2. **Webページの公開**：Settings → Pages → Build and deployment で
   Source を「Deploy from a branch」、Branch を `main` / `/(root)` にして保存。
3. **最初の創造**：Actions → 「世界の時計」→ Run workflow（mode: auto）。
   以後は cron-job.org から毎時、この workflow_dispatch が呼ばれて動きます。

## 調整

- 月の予算上限：既定 90 USD。Settings → Secrets and variables → Actions → Variables に
  `WORLD_MONTHLY_BUDGET` を作ると変更できます。上限に達するとその月は自動停止します。
- 使うモデルや頻度：`engine/settings.py`
- 動作確認（AIを呼ばない模擬モード）：`WORLD_MOCK=1 python engine/tick.py auto`
