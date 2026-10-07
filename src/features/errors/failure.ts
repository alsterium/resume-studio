export interface FailureDetail {
  message: string;
  code?: string;
  log?: string;
}

const guidance: Record<string, string> = {
  TEX_NOT_FOUND:
    "TeX環境を確認し、latexmk・LuaLaTeX・kpsewhichを利用できる状態にしてから再実行してください。TeX一式の書き出しは引き続き利用できます。",
  TEX_DEPENDENCY_MISSING:
    "不足しているパッケージ・フォントをTeX環境へ追加し、もう一度環境を確認してください。",
  COMPILE_FAILED:
    "TeX環境を確認してください。不足がなければ、生成ログで失敗した箇所を確認してから再実行してください。",
  TIMEOUT: "生成が時間内に完了しませんでした。入力の量とTeX環境を確認してから再実行してください。",
  IO_ERROR:
    "ディスクの空き容量と書き込み権限を確認してください。保存操作なら別の保存先も選べます。",
  OUTPUT_TOO_LARGE:
    "PDFは20MiB以内にしてください。入力や写真を見直して、もう一度生成してください。",
  TEMPLATE_NOT_FOUND: "利用可能なテンプレートを選択してから、もう一度生成してください。",
  CANCELED: "入力の編集を続けられます。必要ならもう一度生成してください。",
};

// Legacy Rust errors carry a code on the first line and bounded logs below it.
// Only a known, terminal header code is interpreted; body text is never a code.
export function describeFailure(error: string | FailureDetail) {
  let detail: FailureDetail;
  if (typeof error === "string") {
    const newline = error.indexOf("\n");
    const header = (newline < 0 ? error : error.slice(0, newline)).replace(/\r$/u, "");
    const match = /\s*\(([A-Z_]+)\)$/u.exec(header);
    detail =
      match && Object.hasOwn(guidance, match[1])
        ? {
            message: header.slice(0, match.index),
            code: match[1],
            log: newline < 0 ? "" : error.slice(newline + 1),
          }
        : { message: error };
  } else detail = error;
  return {
    ...detail,
    guidance:
      detail.code && Object.hasOwn(guidance, detail.code)
        ? guidance[detail.code]
        : "入力内容と保存先を確認して、もう一度お試しください。保存できない場合は別の保存先を選んでください。",
  };
}
