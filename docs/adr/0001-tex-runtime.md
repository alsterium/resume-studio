# ADR 0001: 日本語PDF生成環境

状態: 採用（2026-10-06）

LuaLaTeX、LuaTeX-ja、Harano Ajiフォントとlatexmkを採用する。macOSの既知パスからシステムのTeXを検出し、TeX・フォントをアプリへ同梱しない。TeX Live 2026basic、latexmk 4.88で実日本語PDFと特殊文字の抽出を確認した。

RustジェネレータはTauri非依存のモジュールに置く。テンプレートはinclude_strで同梱する。通常文字を単一関数でエスケープし、固定名main.tex/content.texへ書き出す。実行は隔離ディレクトリ、latexmk設定無効、shell escape無効、60秒上限とする。本文ASTとテンプレートmanifestはそれぞれT16・T17で拡張する。

GUIは実WebViewで最小PATHの検出・実IPC・診断成功を確認した。PDF.jsとTiptapの選定・互換性の記録は導入時に追加する。
