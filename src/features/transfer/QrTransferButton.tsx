import { lazy, Suspense, useState } from "react";
import type { Project } from "../../domain/project";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "../../components/ui/dialog";
const TransferPanel = lazy(() => import("./TransferPanel"));
export function QrTransferButton({
  project,
  dirty,
  disabled,
  onReceive,
  onActiveChange,
}: {
  project: Project;
  dirty: boolean;
  disabled: boolean;
  onReceive: (project: Project) => void;
  onActiveChange: (active: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  function change(value: boolean) {
    setOpen(value);
    onActiveChange(value);
  }
  return (
    <>
      <Button variant="outline" disabled={disabled} onClick={() => change(true)}>
        QR転送
      </Button>
      <Dialog open={open} onOpenChange={change}>
        <DialogContent className="qr-transfer-dialog">
          <DialogTitle>QRでプロジェクト転送</DialogTitle>
          <DialogDescription>
            送る側でQRを表示し、受け取る側のカメラを向けます。データは端末間で読み取り、サーバーへ送りません。
          </DialogDescription>
          {open && (
            <Suspense fallback={<p>転送モードを準備中…</p>}>
              <TransferPanel
                project={project}
                dirty={dirty}
                onReceive={(received) => {
                  onReceive(received);
                  change(false);
                }}
              />
            </Suspense>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
