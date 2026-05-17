# Claude 向け運用ガイド — COUNT DOWN STUDIO

⚠️ **作業を始める前に、必ず以下の順で読むこと。**

## 1. 最新の引き継ぎ書（最優先）

```
~/Documents/CDS/CDS-引き継ぎ-YYYY-MM-DD.md
```

最新日付のものを `ls ~/Documents/CDS/CDS-引き継ぎ-*.md | sort | tail -1` で特定して Read。
2026-05-17 時点では `CDS-引き継ぎ-2026-05-17.md`。

このファイルが **そのセッションでの真実**。スキル本体より優先する。

## 2. スキル本体（恒久ナレッジ）

```
anthropic-skills:count-down-studio
```

Skill ツールで起動。アプリの構造・落とし穴・のむさんの好みなど、**変わらない情報** がまとまっている。ただし最終更新が遅れることがあるので、引き継ぎ書で上書きされた情報があれば引き継ぎ書を優先する。

## 3. デプロイ補助スキル

```
anthropic-skills:concert-app-deploy
```

push / デプロイ系の作業で発動。

---

## 引き継ぎ書の更新ルール

- 大改修・新機能追加・運用ルール変更があったら、**新しい日付のファイル** で追記（古いものは消さない）：
  - 命名：`~/Documents/CDS/CDS-引き継ぎ-YYYY-MM-DD.md`
  - 既存：5/1 / 5/15 / 5/17（複数あり、日付別アーカイブ）
- 軽微な変更（型エラー潰し、軽いリファクタ）は引き継ぎ書を更新する必要なし
- **怒りサイン（「ちゃんと仕事してるか？」「だめだね」）が出たら、手を止めて即引き継ぎ書を作る**

---

## のむさんの常時許可ポリシー（2026-05-17 確認）

のむさんは Claude に対して **以下の操作を常時許可済み** として扱う。毎回の確認は不要：

- ✅ **`request_cowork_directory`**：CDS / schedule-studio / その他のフォルダ mount は **即実行**（確認スキップ）
- ✅ **Chrome MCP のブラウザ選択**：複数 Chrome が接続されてる場合、**「チェック用」を優先**（無ければ最新接続の Browser）
- ✅ **コード修正・commit・push（SSH 鍵経由、`git push origin main` で直接）** は確認不要
- ✅ **SW_CACHE_NAME 更新**、`@font-face` 追加、`package.json` 編集なども確認不要
- ✅ **本番反映確認** は SW 自動更新に任せる（のむさんに Cmd+Shift+R 依頼は最小化）

「ゆっくりじっくり」が好み、ただし「どんどん進めて」「全部やって」と言われたら確認最小化。**破壊系（force push、hard reset、大量削除、PAT 漏洩リスク）以外は基本的に確認なしで進める**。

---

## 「どんどん進める」フロー（2026-05-18 以降・Claude Code 流）

1. **このファイル + 最新引き継ぎ書を Read**
2. **`git pull --rebase origin main`**
3. **修正 → Edit ツール**
4. **`git add` + `git commit`**
5. **`git push origin main`**（SSH 鍵経由・Claude Code は Mac ローカルなので PAT 不要）
6. **GitHub Actions 完了を待つ（30秒〜2分）**
7. **本番反映は SW 自動更新で自動 reload される**（Cmd+Shift+R 不要）

※ Cowork 時代は PAT をチャットに貼る運用だったが、Claude Code 移行後は **SSH 鍵で直 push**。リポの remote が HTTPS のままなら `git remote set-url origin git@github.com:nrs2013/<repo>.git` で切り替える。

---

## 重要な「やらない」リスト

- ❌ コード用語そのまま使う（フック、mutation、state、IndexedDB を翻訳せず話す）
- ❌ `useDuplicateGuard` の `enabled` 引数を消す
- ❌ `/output` のシングルクリックを fullscreen 切替にする
- ❌ IME 3 層ガードを壊す
- ❌ `SW_CACHE_NAME` を sw.js と main.tsx のどちらか一方だけ上げる（両方揃える）
- ❌ DB_VERSION を上げる時に migration を忘れる
- ❌ SCHEDULE STUDIO の認証ルールを取り違える（両方とも SSH 鍵運用、PAT 不要）
- ❌ 怒りサイン後に作業継続
- ❌ **`<ExcelImportModal>` を `manage.tsx` の片方の return ブロックだけに書く**（両方の return 末尾に必ず置く。`PATTERN-進行表ドロップ取り込み.md` §3-1）
- ❌ **`/output` や preview rectangle 内部の見た目を触る**（のむさん厳命）
- ❌ **ボタンを塗りつぶし or 太線で作る**（必ず 0.5px 細線 + 半透明背景 + 白文字）
- ❌ **X-TIME ボタンのアクティブ色を fuchsia にする**（必ず緑）

---

## デバッグの「自分で 3 段階潰す」ルール（2026-05-17）

「動かない」と言われたら、のむさんに何か頼む前に Claude が以下を **自分で** 確認：

1. **配信届いてる？** → Console に `[CDS] build songcountdown-vXX loaded`（ピンク太字）が出てるか
2. **DOM に届いてる？** → 該当ハンドラのログ（`[CDS drop] event fired` 等）が出てるか
3. **コンポーネント描画されてる？** → `document.querySelector('[data-testid="..."]')` で実在確認

Chrome MCP（`mcp__Claude_in_Chrome__*`）で本番 URL を開いて全部確認できる。3 段階潰してから「ここが原因です」と返す。

---

## 関連ドキュメント

- `replit.md` — 仕様の要点（README より濃い）
- `~/Documents/CDS/CDS-引き継ぎ-*.md` — 日付別スナップショット
- `~/Documents/CDS/PATTERN-進行表ドロップ取り込み.md` — Excel/CSV ドロップ取り込みの汎用パターン書
- パトロール報告書（`outputs/CDS-パトロール...`）

— のむさん × Claude
