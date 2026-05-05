# COUNT DOWN STUDIO

MIDI連動コンサート用カウントダウンタイマー（PWA対応）。
TELOP STUDIOの姉妹アプリ。

本番URL: **https://nrs2013.github.io/count-down-studio/**

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

## 型チェック

```bash
npm run check
```

---

## 🚀 デプロイ運用（GitHub Pages）

このリポジトリは **GitHub Pages** で運用されている。
`main` ブランチに push すると、`.github/workflows/deploy.yml` が自動で走り、
数分後に本番 URL（https://nrs2013.github.io/count-down-studio/）に反映される。

### コード変更のフロー

1. ローカルでコードを修正
2. ターミナルで以下を実行：

```bash
git add .
git commit -m "変更内容の説明"
git push
```

3. GitHub Actions が自動でビルド＆デプロイ（進捗は GitHub の Actions タブで確認可能）
4. 数分後、本番 URL がアップデートされる

### PWA を更新したらキャッシュ更新

PWA 化されているので、本番反映後に古いバージョンがキャッシュに残ることがある。
Service Worker のバージョン番号（`client/public/sw.js` の `CACHE_NAME` と `client/src/main.tsx` の `SW_CACHE_NAME`）を上げると、
ユーザー側で自動的に新しいキャッシュに切り替わる。

---

## 構成

- `client/` — フロントエンドのソースコード
  - `src/components/` — UIコンポーネント
  - `src/pages/` — ページ（/ , /manage, /output）
  - `src/hooks/` — Reactフック（MIDI、カウントダウン、アンドゥなど）
  - `src/lib/` — ユーティリティ、IndexedDB操作
  - `public/` — 静的アセット（アイコン、Service Worker、manifest）
- `dist/` — ビルド出力（自動生成、`.gitignore`）
- `vite.config.ts` — Viteの設定（base: `/count-down-studio/`）
- `.github/workflows/deploy.yml` — GitHub Pages 自動デプロイ

## ブラウザ要件

- **MIDI機能**: Chrome / Edge のみ対応（Web MIDI API）
- **PWAインストール**: Chrome / Edge / Safari で可能
- Firefox はMIDI非対応（Web MIDI APIを実装していない）
