# ADR 0003: 本文エディタ

状態: 採用（2026-10-06、OSのIME受け入れ確認済み）

Tiptap 3.31.4、React bindingsとProseMirrorを採用する。公式npmのpeerDependenciesでReact 19との互換性を確認した。[React導入手順](https://tiptap.dev/docs/editor/getting-started/install/react)に従いuseEditor・EditorContent・useEditorStateを利用する。

[StarterKit](https://tiptap.dev/docs/editor/extensions/functionality/starterkit)から対応外node/markを無効化する。許可本文をJSONで保持し、Rustが最終検証とTeX変換を担当する。[setContent](https://tiptap.dev/docs/editor/api/commands/content/set-content)のerrorOnInvalidContentを有効にしたJSON往復を検証する。

自動検証で日本語本文・太字・斜体・リスト・改行の保持を確認した。実macOS WebViewでは合成compositionイベントを確認した。OSの日本語IMEの変換・確定・追加入力とPDF更新は別途ユーザーが実操作し、2026-10-06に「全て正常です」と回答した。自動検証と手動受け入れの両方を証跡としてT08を完了した。
