use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::task::Waker;

#[derive(Default)]
struct State {
    cancelled: AtomicBool,
    waiter: Mutex<Option<Waker>>,
}

#[derive(Clone, Default)]
pub struct Cancellation(Arc<State>);

impl Cancellation {
    pub fn cancel(&self) {
        self.0.cancelled.store(true, Ordering::Release);
        let waker = self
            .0
            .waiter
            .lock()
            .ok()
            .and_then(|mut waiter| waiter.take());
        if let Some(waker) = waker {
            waker.wake();
        }
    }

    pub fn is_cancelled(&self) -> bool {
        self.0.cancelled.load(Ordering::Acquire)
    }

    pub(super) fn register(&self, waker: &Waker) {
        if let Ok(mut waiter) = self.0.waiter.lock() {
            *waiter = Some(waker.clone());
        }
    }
}

pub const CANCELLED: &str = "PDF生成をキャンセルしました。 (CANCELED)";
