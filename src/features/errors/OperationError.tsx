import { describeFailure, type FailureDetail } from "./failure";

export function OperationError({ error }: { error: string | FailureDetail }) {
  const failure = describeFailure(error);
  return (
    <div role="alert" className="operation-error">
      <p>{failure.message}</p>
      <p>{failure.guidance}</p>
      {failure.code && <small>エラーコード：{failure.code}</small>}
      {failure.log && (
        <details>
          <summary>生成ログを表示</summary>
          <pre>{failure.log}</pre>
        </details>
      )}
    </div>
  );
}
