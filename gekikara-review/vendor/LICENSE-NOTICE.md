# 同梱ライブラリ・モデルのライセンス表記

このフォルダの内容は外部通信ゼロ(CDN不使用)を実現するため、ビルド時に取得しリポジトリへ同梱しているものです。

- **TensorFlow.js** (`tf.min.js`) — Apache License 2.0 — https://github.com/tensorflow/tfjs
- **MobileNet v1 (1.0/224) 画像分類モデル** (`mobilenet/`) — Apache License 2.0 — https://github.com/tensorflow/tfjs-models/tree/master/mobilenet
  - 取得元: `https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_1.0_224/`（Google公式配布）

いずれも改変せずそのまま同梱している。バージョン更新時はこのファイルの取得元URLを使って再取得すること。
