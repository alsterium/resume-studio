use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub enum JobPhase {
    Queued,
    Validating,
    Generating,
    Compiling,
    Succeeded,
    Failed,
}

#[derive(Clone, Default)]
pub struct GenerationJobs {
    gate: Arc<tauri::async_runtime::Mutex<()>>,
    pending: Arc<AtomicUsize>,
}

struct Slot(Arc<AtomicUsize>);
impl Drop for Slot {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::AcqRel);
    }
}

impl GenerationJobs {
    // Diagnostics and draft generation share the same compiler gate. Bounds
    // include the active job, so concurrent IPC cannot grow an unbounded queue.
    pub async fn execute<T: Send + 'static>(
        &self,
        progress: impl Fn(JobPhase) + Send + Sync + 'static,
        work: impl FnOnce(&dyn Fn(JobPhase)) -> Result<T, String> + Send + 'static,
    ) -> Result<T, String> {
        self.pending
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |n| {
                (n < 8).then_some(n + 1)
            })
            .map_err(|_| "生成の待機件数が上限です。完了後に再実行してください。")?;
        let slot = Slot(self.pending.clone());
        progress(JobPhase::Queued);
        let guard = self.gate.clone().lock_owned().await;
        tauri::async_runtime::spawn_blocking(move || {
            // Keep the gate inside the worker even if the IPC future is dropped.
            let (_guard, _slot) = (guard, slot);
            progress(JobPhase::Validating);
            let result = work(&progress);
            progress(if result.is_ok() {
                JobPhase::Succeeded
            } else {
                JobPhase::Failed
            });
            result
        })
        .await
        .map_err(|_| "生成処理を完了できませんでした。再実行してください。".to_string())?
    }
}
