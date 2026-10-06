use super::cancellation::{Cancellation, CANCELLED};
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc, Mutex,
};
use std::{
    collections::HashMap,
    future::{poll_fn, Future},
    task::Poll,
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
    Cancelled,
}

#[derive(Clone, Default)]
pub struct GenerationJobs {
    gate: Arc<tauri::async_runtime::Mutex<()>>,
    pending: Arc<AtomicUsize>,
    registered: Registry,
}

type Registry = Arc<Mutex<HashMap<String, Cancellation>>>;
struct Slot {
    pending: Arc<AtomicUsize>,
    registration: Option<(Registry, String)>,
}
impl Drop for Slot {
    fn drop(&mut self) {
        if let Some((registry, id)) = &self.registration {
            if let Ok(mut registered) = registry.lock() {
                registered.remove(id);
            }
        }
        self.pending.fetch_sub(1, Ordering::AcqRel);
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
        self.execute_inner(None, progress, move |notify, _| work(notify))
            .await
    }

    pub fn cancel(&self, job_id: &str) -> Result<bool, String> {
        let registered = self
            .registered
            .lock()
            .map_err(|_| "生成状態を確認できませんでした。")?;
        if let Some(token) = registered.get(job_id) {
            token.cancel();
            Ok(true)
        } else {
            Ok(false)
        }
    }

    pub async fn execute_cancellable<T: Send + 'static>(
        &self,
        job_id: String,
        progress: impl Fn(JobPhase) + Send + Sync + 'static,
        work: impl FnOnce(&dyn Fn(JobPhase), &Cancellation) -> Result<T, String> + Send + 'static,
    ) -> Result<T, String> {
        if job_id.is_empty()
            || job_id.len() > 128
            || !job_id
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'-')
        {
            return Err("生成ジョブIDが不正です。".into());
        }
        self.execute_inner(Some(job_id), progress, work).await
    }

    async fn execute_inner<T: Send + 'static>(
        &self,
        job_id: Option<String>,
        progress: impl Fn(JobPhase) + Send + Sync + 'static,
        work: impl FnOnce(&dyn Fn(JobPhase), &Cancellation) -> Result<T, String> + Send + 'static,
    ) -> Result<T, String> {
        self.pending
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |n| {
                (n < 8).then_some(n + 1)
            })
            .map_err(|_| "生成の待機件数が上限です。完了後に再実行してください。")?;
        let mut slot = Slot {
            pending: self.pending.clone(),
            registration: None,
        };
        let token = Cancellation::default();
        if let Some(id) = job_id {
            let mut registered = self
                .registered
                .lock()
                .map_err(|_| "生成状態を準備できませんでした。")?;
            if registered.contains_key(&id) {
                return Err("同じ生成ジョブが実行中です。".into());
            }
            registered.insert(id.clone(), token.clone());
            slot.registration = Some((self.registered.clone(), id));
        }
        progress(JobPhase::Queued);
        let mut acquiring = Box::pin(self.gate.clone().lock_owned());
        let guard = poll_fn(|cx| {
            token.register(cx.waker());
            if token.is_cancelled() {
                return Poll::Ready(Err(CANCELLED.to_string()));
            }
            acquiring.as_mut().poll(cx).map(Ok)
        })
        .await;
        let guard = match guard {
            Ok(guard) => guard,
            Err(error) => {
                progress(JobPhase::Cancelled);
                return Err(error);
            }
        };
        tauri::async_runtime::spawn_blocking(move || {
            // Keep the gate inside the worker even if the IPC future is dropped.
            let (_guard, _slot) = (guard, slot);
            if token.is_cancelled() {
                progress(JobPhase::Cancelled);
                return Err(CANCELLED.into());
            }
            progress(JobPhase::Validating);
            let result = work(&progress, &token);
            let result = if token.is_cancelled() {
                Err(CANCELLED.to_string())
            } else {
                result
            };
            progress(if token.is_cancelled() {
                JobPhase::Cancelled
            } else if result.is_ok() {
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
