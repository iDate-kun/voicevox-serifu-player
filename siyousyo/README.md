# VOICEVOX Serihu Player

VOICEVOXのセリフを再生するためのデスクトップアプリケーションです。

![icon](https://raw.githubusercontent.com/grgr-dkrk/voicevox-serihu-player/main/assets/voicevox-serihu-player-icon.ico)

## 概要

このアプリケーションは、[VOICEVOX](https://voicevox.hiroshiba.jp/)で生成したセリフ（音声ファイル）を管理し、簡単に再生・検索できるようにするためのツールです。キャラクターのセリフ集を作成したり、ゲームや動画制作で利用するボイスを整理したりするのに役立ちます。

## 主な機能

- **セリフの再生**: 登録したセリフをワンクリックで再生します。
- **セリフの検索**: キーワードで登録済みのセリフを検索できます。
- **セリフの登録・削除**: 新しいセリフ（音声ファイル）を登録したり、不要になったセリフを削除したりできます。
- **一覧表示**: 登録したセリフを一覧で確認できます。

## 使い方（開発者向け）

### 1. リポジトリをクローン

```bash
git clone https://github.com/grgr-dkrk/voicevox-serihu-player.git
cd voicevox-serihu-player
```

### 2. 依存関係をインストール

```bash
npm install
```

### 3. アプリケーションを起動

```bash
npm start
```

## ビルド

プロジェクトをパッケージング、または実行可能ファイルを生成するには、以下のコマンドを使用します。

### パッケージング

```bash
npm run package
```

### 配布用の実行ファイルを作成

```bash
npm run make
```

生成されたファイルは `output` フォルダに出力されます。

## ライセンス

このプロジェクトは [ISC License](LICENSE) の下で公開されています。

## 作者


