import { useEffect, useRef } from "react";

export function DiscardDialog({
  busy,
  error,
  onSave,
  onDiscard,
  onCancel,
}: {
  busy: boolean;
  error: string | null;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      aria-labelledby="discard-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onCancel();
      }}
    >
      <h2 id="discard-title">変更を保存しますか？</h2>
      <p>保存していない変更があります。</p>
      {error && <p role="alert">{error}</p>}
      <button type="button" disabled={busy} onClick={onSave}>
        保存して続行
      </button>
      <button type="button" disabled={busy} onClick={onDiscard}>
        保存せず続行
      </button>
      <button type="button" disabled={busy} onClick={onCancel}>
        キャンセル
      </button>
    </dialog>
  );
}
