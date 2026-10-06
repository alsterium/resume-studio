use resume_studio_lib::compiler::jobs::{GenerationJobs, JobPhase};
use std::{
    sync::{mpsc, Arc, Mutex},
    time::Duration,
};

#[test]
fn concurrent_jobs_wait_for_the_active_worker_and_recover_after_failure() {
    let jobs = GenerationJobs::default();
    let trace = Arc::new(Mutex::new(Vec::new()));
    let (started, start) = mpsc::channel();
    let (release, released) = mpsc::channel();
    let first_jobs = jobs.clone();
    let first_trace = trace.clone();
    let first = tauri::async_runtime::spawn(async move {
        first_jobs
            .execute(
                move |phase| first_trace.lock().unwrap().push((1, phase)),
                move |notify| {
                    started.send(()).unwrap();
                    released.recv_timeout(Duration::from_secs(5)).unwrap();
                    notify(JobPhase::Compiling);
                    Err::<(), _>("expected failure".into())
                },
            )
            .await
    });
    start.recv_timeout(Duration::from_secs(5)).unwrap();
    let (queued, queue) = mpsc::channel();
    let second_trace = trace.clone();
    let second = tauri::async_runtime::spawn(async move {
        jobs.execute(
            move |phase| {
                second_trace.lock().unwrap().push((2, phase));
                if phase == JobPhase::Queued {
                    queued.send(()).unwrap();
                }
            },
            |_| Ok(42),
        )
        .await
    });
    queue.recv_timeout(Duration::from_secs(5)).unwrap();
    assert!(!trace.lock().unwrap().contains(&(2, JobPhase::Validating)));
    release.send(()).unwrap();
    assert_eq!(
        tauri::async_runtime::block_on(first).unwrap(),
        Err("expected failure".into())
    );
    assert_eq!(tauri::async_runtime::block_on(second).unwrap(), Ok(42));
    assert_eq!(
        *trace.lock().unwrap(),
        vec![
            (1, JobPhase::Queued),
            (1, JobPhase::Validating),
            (2, JobPhase::Queued),
            (1, JobPhase::Compiling),
            (1, JobPhase::Failed),
            (2, JobPhase::Validating),
            (2, JobPhase::Succeeded),
        ]
    );
}

#[test]
fn abandoning_an_ipc_future_does_not_release_a_running_compiler() {
    let jobs = GenerationJobs::default();
    let (started, start) = mpsc::channel();
    let (release, released) = mpsc::channel();
    let first_jobs = jobs.clone();
    let first = tauri::async_runtime::spawn(async move {
        first_jobs
            .execute(
                |_| {},
                move |_| {
                    started.send(()).unwrap();
                    released.recv_timeout(Duration::from_secs(5)).unwrap();
                    Ok(())
                },
            )
            .await
    });
    start.recv_timeout(Duration::from_secs(5)).unwrap();
    first.abort();
    let (queued, queue) = mpsc::channel();
    let (second_started, second_start) = mpsc::channel();
    let second = tauri::async_runtime::spawn(async move {
        jobs.execute(
            move |phase| {
                if phase == JobPhase::Queued {
                    queued.send(()).unwrap();
                }
            },
            move |_| {
                second_started.send(()).unwrap();
                Ok(())
            },
        )
        .await
    });
    queue.recv_timeout(Duration::from_secs(5)).unwrap();
    assert!(second_start.try_recv().is_err());
    release.send(()).unwrap();
    assert_eq!(tauri::async_runtime::block_on(second).unwrap(), Ok(()));
    second_start.recv_timeout(Duration::from_secs(5)).unwrap();
}

#[test]
fn queue_is_bounded_and_releases_slots_when_waiters_are_abandoned() {
    let jobs = GenerationJobs::default();
    let (started, start) = mpsc::channel();
    let (release, released) = mpsc::channel();
    let first_jobs = jobs.clone();
    let first = tauri::async_runtime::spawn(async move {
        first_jobs
            .execute(
                |_| {},
                move |_| {
                    started.send(()).unwrap();
                    released.recv_timeout(Duration::from_secs(5)).unwrap();
                    Ok(())
                },
            )
            .await
    });
    start.recv_timeout(Duration::from_secs(5)).unwrap();
    let mut waiters = Vec::new();
    for _ in 0..7 {
        let waiting_jobs = jobs.clone();
        let (queued, queue) = mpsc::channel();
        waiters.push(tauri::async_runtime::spawn(async move {
            waiting_jobs
                .execute(
                    move |phase| {
                        if phase == JobPhase::Queued {
                            queued.send(()).unwrap();
                        }
                    },
                    |_| Ok(()),
                )
                .await
        }));
        queue.recv_timeout(Duration::from_secs(5)).unwrap();
    }
    assert!(
        tauri::async_runtime::block_on(jobs.execute(|_| {}, |_| Ok(())))
            .unwrap_err()
            .contains("上限")
    );
    for waiter in waiters {
        waiter.abort();
        assert!(tauri::async_runtime::block_on(waiter).is_err());
    }
    release.send(()).unwrap();
    tauri::async_runtime::block_on(first).unwrap().unwrap();
    assert_eq!(
        tauri::async_runtime::block_on(jobs.execute(|_| {}, |_| Ok(42))),
        Ok(42)
    );
}
