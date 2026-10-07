import { useRef } from "react";
import { OperationError } from "../errors/OperationError";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "../../components/ui/dialog";
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
  const cancel = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onCancel();
      }}
    >
      <DialogContent
        showCloseButton={false}
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          cancel.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>変更を保存しますか？</DialogTitle>
          <DialogDescription>保存していない変更があります。</DialogDescription>
        </DialogHeader>
        {error && <OperationError error={error} />}
        <DialogFooter>
          <Button ref={cancel} type="button" variant="outline" disabled={busy} onClick={onCancel}>
            キャンセル
          </Button>
          <Button type="button" variant="outline" disabled={busy} onClick={onDiscard}>
            保存せず続行
          </Button>
          <Button type="button" disabled={busy} onClick={onSave}>
            保存して続行
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
