# 軽量Webエディタ

公開先は https://resume-studio.alsterium.com/ 。同期・アカウント・サーバー保存は使わず、Mac版と同じProject JSON v1を編集する。編集フォームは共通の`ProjectEditor`、本文編集は既存Tiptap、検証は既存Schema／`validateProject`を使用する。

## 利用

1. 「開く」でプロジェクトJSONを選択する。元ファイルは変更しない。
2. 履歴書／職務経歴書を編集する。スマホでは「編集」「プレビュー」で切り替える。
3. 「保存」でJSONをダウンロードする。「別名保存」では名前を指定できる。Cmd/Ctrl+S、Cmd/Ctrl+Shift+Sも使用できる。
4. ダウンロードしたJSONをMac版で開き、正式なPDF／TeXを出力する。

ダウンロードの開始までをアプリが確認し、端末への保存完了はブラウザで確認する。同名ファイルの上書き・保存先はブラウザに従う。「未保存変更なし」は開いたJSONまたは最後にダウンロードを開始した内容から変更がないことを表す。

ブラウザ内の下書きはIndexedDBへ自動保存し、次回アクセス時に復元する。JSONへの保存状態と分けて表示する。下書きは同じ端末・ブラウザ・originだけで復元でき、ブラウザのデータ消去や容量制限で失われる可能性があるため、ファイルへの保存には「保存」を使う。下書き読込に失敗した場合は起動直後の上書きを止め、「新規」または正常なJSONの読込後に再開する。入力が保存契約に違反する間は最後の正常な下書きを保持し、保存状態へ失敗理由を表示する。

写真はJPEG／PNGの5MiB以内。向きを反映し、縦横比を保って最大600×800pxへ縮小し、画素から再エンコードする。写真・本文AST・テンプレートID／版・未編集の項目もJSONに保持する。最終画像検証は引き続きMac版Rustが行う。

プレビューはHTML/CSSの参考表示。文字・写真・罫線・本文書式を表示するが、TeXの改ページや文字縮小を再現しない。長文は紙面を伸ばして全文を表示する。正式出力はMac版で確認する。

## 開発・公開

Node.js／pnpmは既存の固定版を使う。

```sh
pnpm install --frozen-lockfile
pnpm dev:web
```

Web開発は http://127.0.0.1:1421/ 、Mac版のViteは既存の1420を使う。

```sh
pnpm build:web
pnpm preview:web
pnpm exec wrangler deploy --dry-run
pnpm deploy:web
```

`dist-web`だけをWorkers Static Assetsへ公開する。Web用entryをビルド前に差し替えるため、Tauri IPC・PDF.js・TeX・fixtureは公開物へ含めない。`public-web/_headers`でCSP等を設定する。保存や写真処理は端末内で行い、プロジェクトをアップロードするAPIはない。Custom Domainは`wrangler.jsonc`に記録する。認証情報はリポジトリ／タスク証跡へ保存しない。

期限切れ時は次を実行し、開いたブラウザでログインして許可する。

```sh
pnpm exec wrangler login
pnpm exec wrangler whoami
```

環境の書込制限でWranglerのログ保存に失敗する場合は、`WRANGLER_LOG_PATH`へ書込可能な一時ファイルを指定する。

## 検証の境界

`tests/integration/web.test.tsx`は同じ全項目fixtureの読込→編集→ダウンロード→再読込、IndexedDBの復元／順序／古い完了抑止、失敗時保持、切替、IME／保存キーを検証する。IndexedDBはfake-indexeddb、UIは実Tiptap＋jsdom、ファイル選択はTesting Libraryで行う。写真の寸法・容量・向き指定・縮小は`tests/unit/browser-photos.test.ts`で検証する。共通JSON検証は5MiBのbase64と不正padding等も検証する。

実Safariの表示と390px幅の切替／下書き復元を別に目視確認する。レスポンシブデザインモードは実iPhoneの仮想キーボード・共有シート・ダウンロード操作を代替しない。

## 公開確認（2026-10-13）

Worker `resume-studio-web`をCustom Domainへ公開済み。独自ドメインのHTTPS、HTML/CSS/JSの200応答とビルド一致、CSP等のヘッダーを確認した。実Safariで起動・架空入力の反映・JSONダウンロードと390pxの編集／プレビュー切替を確認した。UI／単体73件は順次実行で成功。`pnpm check`の並列UI実行では既存career全項目テストの15秒timeoutが再発したため、同じ全件を`pnpm exec vitest run --no-file-parallelism tests/integration tests/unit`で検証した。Rust検証は既存キャンセルテストの記録書込競合を修正して成功。

## QRでMacと受け渡す

「QR転送」で、送る端末は「送信モード」→「ループ送信を開始」、受け取る端末は「受信モード」→「カメラを開始」を選ぶ。開始→データ→終了のQRが0.5秒ごとに循環し、受信は途中からでも読み続けられる。「受信完了」後に内容を確認して取り込み、JSONを保存する。読み取りづらい場合は送信間隔を1秒/2秒へ変更できる。写真も含むため容量によって時間がかかる。詳細は[QR_TRANSFER](QR_TRANSFER.md)。
