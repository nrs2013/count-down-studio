# COUNT DOWN STUDIO

MIDI連動コンサート用カウントダウンタイマー（PWA対応）。
TELOP STUDIOの姉妹アプリ。

## 技術スタック

- React + Vite + TypeScript
- Tailwind CSS + shadcn/ui
- IndexedDB（ブラウザ内ローカル保存、サーバー不要）
- Web MIDI API（Chrome / Edge）
- PWA（オフライン動作・インストール可能）

## ローカルで起動する方法

```bash
npm install
npm run dev
```

ブラウザで `http://localhost:5173` を開く。

## ビルド

```bash
npm run build
```

`dist/` に静的ファイルが生成される。

---

## 🚀 Vercelへのデプロイ手順（初めての方向け）

### ステップ1: GitHubにリポジトリを作る

1. [github.com](https://github.com) にログイン
2. 右上の「+」→「New repository」
3. リポジトリ名を入力（例：`count-down-studio`）
4. **「Private」**（非公開）を選ぶ（推奨）
5. 「Create repository」をクリック

### ステップ2: このフォルダをGitHubにpushする

ターミナル（Macの「ターミナル.app」）を開いて、このプロジェクトフォルダに移動：

```bash
cd ~/Downloads/count-down-studio    # ← 実際の場所に合わせて
```

以下のコマンドを順番に実行（`YOUR_USERNAME`と`REPO_NAME`は自分のものに置き換え）：

```bash
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/REPO_NAME.git
git push -u origin main
```

もし認証を求められたら、GitHubのユーザー名とPersonal Access Token（パスワードではない）を入力。

### ステップ3: Vercelでデプロイ

1. [vercel.com](https://vercel.com) にアクセス
2. 「Sign Up」→ 「Continue with GitHub」でGitHub連携
3. 「Add New...」→「Project」
4. 作ったリポジトリを選んで「Import」
5. 設定はそのまま（Vercelが自動でViteを検出してくれる）
6. 「Deploy」をクリック

数十秒待つと、`https://your-app.vercel.app` のようなURLでアプリが公開される🎉

### ステップ4: 独自ドメインを設定（任意）

Vercelのプロジェクト画面 →「Settings」→「Domains」で好きなドメインを追加できる。

---

## 📝 アプリを更新する方法

コードを修正した後：

```bash
git add .
git commit -m "変更内容の説明"
git push
```

これで**Vercelが自動で再デプロイ**してくれる。

---

## 構成

- `client/` — フロントエンドのソースコード
  - `src/components/` — UIコンポーネント
  - `src/pages/` — ページ（/ , /manage, /output）
  - `src/hooks/` — Reactフック（MIDI、カウントダウン、アンドゥなど）
  - `src/lib/` — ユーティリティ、IndexedDB操作
  - `public/` — 静的アセット（アイコン、Service Worker、manifest）
- `dist/` — ビルド出力（自動生成）
- `vite.config.ts` — Viteの設定
- `vercel.json` — Vercelのデプロイ設定

## ブラウザ要件

- **MIDI機能**: Chrome / Edge のみ対応（Web MIDI API）
- **PWAインストール**: Chrome / Edge / Safari で可能
- Firefox はMIDI非対応（Web MIDI APIを実装していない）
