# MachiTalk v1.0.0

街で使う英会話を練習する、Android Chrome向けの無料・端末内保存型PWA。ASK 4シーン、GUIDE 4シーン。ログイン、広告、外部AI API、アクセス解析はありません。

## 開発・公開

静的ファイルをHTTPSで公開します。ローカルでは `python3 -m http.server 8000` をこのディレクトリで実行し、`http://localhost:8000/` を開きます。`npm test` で教材の整合性と判定例を確認できます。GitHub Pagesは `main` ブランチのルートを公開元とします。

Web Speech APIの読み上げ音声・認識精度・権限挙動はブラウザと端末に依存します。Chromeの音声認識はブラウザ提供サービスを使う場合があり、アプリ自身は音声や学習履歴を送信しません。認識不可の場合も文字入力、回答例、スキップで進めます。採点は登録した意図・表現のルールによる目安で、発音の評価ではありません。

## シーンを追加

1. `data/scenes/` に既存シーンを参考に新しいJSONを作成します。`sceneId`、`startNode`、各ノードの`prompt`、`task`、`acceptedIntents`、`examples`、`next`を設定します。
2. `data/scene-registry.json` の `scenes` に `id`、表示情報、`file` を追加します。
3. `npm test` を実行します。エンジンの変更は不要です。

各 `acceptedIntents` の `expressions` は単語またはフレーズで、同一intent内はOR、`required: true` のintent間はANDです。汎用意味理解ではないため、教材ごとに言い換えを追加できます。`next` は次ノードIDまたは `{ "default": "n2", "variants": [{ "ifIntent": "choice", "node": "n2b" }] }` として分岐できます。

## アバターを追加

`data/avatar-registry.json` の `avatars` に画像、クロップ位置、各表情を登録すると選択できます。会話データの `avatar` にIDを指定できます。初期Aikoは承認済みのMachiTalk画像に含まれる同一人物の表情を表示します。人物画像は著作権を含むため、このリポジトリ用の素材として扱ってください。

学習履歴と設定はIndexedDBに保存し、将来の移行用に`schemaVersion`を付与します。ページをオフラインで起動するには一度オンラインで表示します。個々のシーンJSONは利用時に読み込みキャッシュするため、未訪問シーンはオフラインでは使えない場合があります。
