# QRプロジェクト転送（RSQR2 / T67・T68）

MacアプリとHTTPS Web版で同じ形式を使用する。サーバー保存・通信・ペアリング・応答QRは使わない。写真・本文AST・テンプレート参照を含むProject JSON v1を変更せずに転送する。

## 光学シーケンス

送信内容を開始時にスナップショット化し、UTF-8 JSON（20MiB以内）をgzip圧縮する。圧縮データを900byte単位へ分割し、base64をASCII byteモードでQRへ格納する。QRはVersion30（137×137）、誤り訂正M、周囲4moduleの白余白。各QRは500ms表示し、`B開始 → D0…D(N-1) → E終了 → B開始…`を循環する。送信側は受信完了を自動検知せず、相手の完了表示を見て停止する。一時停止、前後送り、指定データ番号から再開、低速表示も提供する。

受信はB/D/Eのどこからでも同一transferを選べる。各フレームに全体のメタデータを置き、途中開始でも蓄積できる。Bを見ても既存チャンクを消さない。Dは順不同・重複を許容。Eを見て不足があれば欠けた番号を示して次周回を待つ。全Dが揃った後のEでSHA-256→容量制限付き展開→UTF-8→JSON構造/意味を検証してカメラを止め「受信完了」へ進む。別transferのQRは混ぜず、明示的なリセット後に選び直す。

## フレーム契約

`RSQR2|kind|id|sha256|compressedBytes|jsonBytes|count|index|crc32|base64|chunkBytes`

- kind: B/D/E。id: 暗号乱数16byteの小文字hex。sha256: gzip全体の小文字hex。
- compressedBytes: 1〜21MiB、jsonBytes: 1〜20MiB、count: ceil(compressedBytes/900)。十進数は余計な先頭0なし。
- Dのindexは0基準、チャンクのCRC32を8桁hexで記録。base64は正規形式。最終チャンクの長さも全体長から検証する。
- B/Eはindex=0、crc32=00000000、base64空。全フレームは1370 ASCII byte以内（Version30/Mのbyte容量）。
- chunkBytesは900固定。旧RSQR1（10フィールド・1500byte分割）は受信のみ対応する。旧アプリはRSQR2を受信できないため、送受信両方を最新版へ更新する。
- セッション内メタデータの変更、同じindexの内容矛盾、不正CRCは拒否。重複は進捗に加算しない。
- 展開を小さい入力単位で行い、申告JSON長/20MiBを超えたら中止する。gzipのCRC/長さと宣言長、プロジェクト検証も必要。

## UIと保存

両環境の「QR転送」から送信/受信を選ぶ。受信カメラは「カメラを開始」だけで起動し、音声は要求しない。背面を優先し、カメラ選択・停止/再開ができる。停止や一時的なバックグラウンド移行はチャンクを保持し、ダイアログ終了/リセットは破棄する。閉じた後に許可が返っても直ちにtrackを停止する。

受信完了でカメラと進捗表示を専用確認画面に切り替え、見出しへスクロール・フォーカスする。まだ反映していないことと次の操作を示す。名前・プロジェクト名を確認し、「この内容を取り込む」を押した場合だけ編集内容を置換する。未保存変更がある場合は置換への同意を別途求める。Macでは既存fileIdを外して未保存プロジェクトとして取り込み、Webでも未保存JSONとしてブラウザ下書きへ保存する。元ファイルの自動上書きは行わない。転送だけではJSON保存済みにならない。

写真は損失なく含めるため、容量によって数分〜数十分以上かかる。最短1周は(N+2)×0.5秒であり、読取失敗を含まない目安。QR画面は周囲からも読み取れる。暗号化・相手認証はせず、ハッシュは破損/混入検出である。使い終えたら画面を閉じる。

## 検証

共通fixtureの圧縮/QR画像生成/実jsQR読取/再組立/JSON一致を確認。複数枚、途中開始、欠落と次周回、逆順、重複、開始終了、不正メタデータ/CRC/hash/gzip/容量を単体/結合で確認。UIで500msループ、受信確認/既存内容保持、カメラ拒否/停止/遅い許可後のcleanupを確認する。MacはInfo.plistの用途記述と署名用camera entitlementを設定する。今回のdebugビルドはリンカーのad-hoc署名でentitlementを埋め込まないが、現環境でカメラ起動・停止を確認した。配布署名時のentitlement適用と、実PC↔iPhoneの距離・画面輝度・ピント・最低対応OSは別途検証が必要。

参考: [DENSO QR容量と版](https://www.qrcode.com/en/about/version.html)、[node-qrcode](https://github.com/soldair/node-qrcode)、[jsQR](https://github.com/cozmo/jsQR)、[fflate](https://github.com/101arrowz/fflate)、[Tauri macOS設定](https://v2.tauri.app/distribute/macos-application-bundle/)。
