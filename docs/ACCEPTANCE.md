# MVP受け入れ記録

T28の受け入れを[PRD](PRD.md)へ対応付ける。進捗の正本は[JSONL台帳](../tasks/tasks.jsonl)。自動テスト、OS実操作、紙面目視はそれぞれの境界を区別する。表の「自動確認済み」はOSダイアログや物理IMEの完了を意味しない。

## 要件と証跡

| 要件 | 確認内容・証跡 | 現状 |
| --- | --- | --- |
| F01 作成／サンプル | 新規で両書類を保持。files/session UI結合とProject fixture往復。架空サンプルは「開く」で選択する | 自動確認済み。OS選択は下記実操作 |
| F02 共通情報 | resume UI結合、共通日付fixture、Rust dates、実E2Eの満25歳／両書類の氏名と日付 | 自動確認済み |
| F03 履歴書 | resume UI結合の全項目／行順／追加削除／上限、実E2Eと実TeXの全文・続紙 | 自動確認済み |
| F04 職務経歴 | career UI結合の会社／案件／スキル全項目・順序・上限、実E2E／real_texの全文／リンク | 自動確認済み |
| F05 WYSIWYG | editor UI結合、本文JSON往復、Rust visitor、実TeXのmark／リスト。長文で実Tiptap Undo/Redo | 自動確認済み。物理IMEキーは下記実操作 |
| F06 JSON | storageの実FSと失敗注入、files/session UI結合、実E2Eの保存→移動→再起動→読込→全項目／書式復元 | 自動確認済み。OS選択は下記実操作 |
| F07 同梱テンプレート | documentsのID／版／種別／Schema照合、空／通常の両書類、bundleの同梱資源から実PDF | 自動確認済み |
| F08 TeX出力 | outputs結合、実E2Eの両TeX一式／写真／manifest、書き出し後の独立latexmk | 自動確認済み。OS選択は下記実操作 |
| F09 PDF出力 | outputsの置換／原本／部分成功、export UI結合、実E2Eの両PDF保存と上書きスキップ | 自動確認済み。OS上書きは下記実操作 |
| F10 プレビュー | preview UI結合、実PDF.jsの描画画素／倍率／各書類切替、複数ページ | 自動確認済み |
| F11 診断・復旧 | diagnosticsの不足資源／未コンパイル、エラー分類Unit、UIのログ・再試行、実E2E日本語診断成功 | 自動確認済み |
| F12 未保存状態 | session Unit/UI、保存中編集、破棄・保存・キャンセル、実CloseRequested／ExitRequestedと正常保存終了 | 自動確認済み。OS終了操作は下記実操作 |
| F13 写真 | photosの実PNG／JPEG／Exif／不正入力、UIの選択／置換／削除、JSON移動後の実PDF写真位置・寸法 | 自動確認済み |
| F14 再利用 | Node改名結合、新規cloneの改名／111テスト／通常bundle／実E2E、GitHub private template設定、セットアップ・テンプレート開発手順 | 確認済み |
| N01 オフライン | 同梱worker／資源とCSP、外部通信遮断profileのEPERM、ネイティブアプリ／TeX子プロセスを遮断した全E2E | 補完確認済み。PCのネットワーク断は下記実操作 |
| N02 応答性 | 600行の本文から下書き／職務経歴書の実PDFが10ページ以上。実compile段階でフォーム入力、React revisionと更新前表示 | 自動確認済み。時間の一律SLAは設けない |
| N03 保存失敗 | storage/outputsの実一時書込→失敗注入、JSON/PDF原本保持、TeX全体復元と退避、UI未保存維持 | 自動確認済み |
| N04 TeX安定性 | generation/documentsのゴールデンと固定fixture、配列順、共通エスケープ、本文visitor | 自動確認済み |
| N05 日本語・キー | T08の日本語IMEはユーザー確認済み。T33の保存キーUI/実WebView、長文Undo/Redo | 新しい物理保存キー／IMEの組合せは下記実操作 |
| N06 中断回復 | process Unit、jobs/cancellationの実待機／compile中キャンセル・timeout・子孫停止・後始末、実E2Eキャンセル | 自動確認済み |
| N07 古いPDF | UIの遅延結果・別project／revision／kind／jobId照合、成功PDF維持、実compile中編集後の更新前表示 | 自動確認済み |
| N08 CI | TS/Oxc/Rust/Node/UI/Unit/実TeX/実WebView/通常bundleとrequired-checks | 最新Pushの全ジョブ成功を台帳へ記録する |

紙面はT20で空／通常、最大固定項目、本文64KiB、日本語／英数字、mark境界、PNG／JPEGの10実TeXテストと128ページの画像化・目視を行った。架空QA成果物はローカル一時領域だけにある。T28のE2E補完は紙面定義を変更しない。

## 補完E2Eの再現

```sh
pnpm build:e2e
RESUME_STUDIO_E2E_OFFLINE=1 pnpm test:e2e
```

macOSのsandbox-exec profileで、ネイティブアプリと直接の子プロセスの外部向け接続を拒否する。WebDriver用localhostだけを許可し、TEST-NETアドレスへの接続がEPERMで拒否されることを先に確認する。再起動したアプリにも同じprofileを適用する。PC全体のWi-Fi等は切り替えない。WebKitのOSサービスや物理ネットワーク断そのものをこのprofileの証跡で代替せず、N01の実操作は別に残す。

既定のE2Eも600行と10ページ以上、本文Undo/Redo、実compile中の入力と更新前表示を確認する。入力dispatchの所要時間は参考値で、編集開始から描画完了までのSLAではない。pickerと上書き確認は引き続きテスト用adapter。実TeX・保存・PDF描画は代替しない。

## 最後のOS実操作

自動化で置き換えた境界を通常ビルドで確認する。本人データを使う必要はない。確認用の架空JSONと空の出力フォルダを一時ディレクトリへ用意し、通常.appを起動する。サンプル原本のGit管理ファイルは上書きしない。

1. 「開く」のOSダイアログで確認用JSONを選び、両書類の内容と写真を確認する。「名前を付けて保存」で一時ディレクトリ内へ別名JSONを保存する。
2. 本文で日本語を変換・候補選択・確定する。変換中のCmd+Sが保存ダイアログを開かないこと、確定後のCmd+SとCmd+Shift+S、本文Undo/Redoを確認する。
3. 両書類のPDFを生成して表示する。書き出しでPDF／両方を選び、OSフォルダ選択から保存する。同じ場所への再出力で上書き／スキップをそれぞれ選び、結果を確認する。TeX／両方も別の出力フォルダへ保存する。
4. 未保存の編集後にウィンドウの閉じるボタンまたはCmd+Qを使い、キャンセルで入力が残ること、保存して続行で終了することを確認する。再起動して保存したJSONをOSダイアログから開き、内容を確認する。
5. PCのネットワークを切った状態で編集・JSON保存・両PDF生成／保存を行い、終了後にネットワークを戻す。開発サーバーを必要としない通常.appを使用する。

正常なら各手順の結果を台帳へ記録する。問題があれば操作と表示内容を記録し、修正・再確認してからT28を完了する。未確認の状態でMVP受け入れを完了にしない。
