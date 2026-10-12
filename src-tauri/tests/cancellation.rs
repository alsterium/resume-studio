#![cfg(unix)]

use resume_studio_lib::{
    compiler::{
        cancellation::Cancellation, compile::compile_with_control, diagnostics::TexRuntime,
    },
    generator::{generate, Draft},
};
use std::{
    fs,
    os::unix::fs::PermissionsExt,
    time::{Duration, Instant},
};

#[test]
fn cancellation_and_timeout_stop_real_descendants_and_delete_working_resources() {
    for cancel in [true, false] {
        let directory = tempfile::tempdir().unwrap();
        let record = directory.path().join("process.txt");
        let script = directory.path().join("latexmk");
        let path = record.to_string_lossy().replace('\'', "'\\''");
        fs::write(&script, format!("#!/bin/sh\nsleep 30 &\nchild=$!\nprintf '%s\\n%s\\n%s\\n' \"$PWD\" \"$$\" \"$child\" > '{path}'\nwait\n")).unwrap();
        fs::set_permissions(&script, fs::Permissions::from_mode(0o755)).unwrap();
        let runtime = TexRuntime {
            latexmk: Some(script),
            ..TexRuntime::default()
        };
        let bundle = generate(&Draft {
            name: "架空".into(),
            body: "停止検証".into(),
            rich_body: None,
        })
        .unwrap();
        let token = Cancellation::default();
        let worker_token = token.clone();
        let worker = std::thread::spawn(move || {
            compile_with_control(
                &runtime,
                &bundle,
                &worker_token,
                if cancel {
                    Duration::from_secs(5)
                } else {
                    Duration::from_secs(1)
                },
            )
        });
        let before = Instant::now();
        // Creating the file precedes writing its contents. Wait for the whole
        // trace so cancellation cannot race the shell's redirected printf.
        let trace = loop {
            if let Ok(trace) = fs::read_to_string(&record) {
                if trace.lines().count() == 3 {
                    break trace;
                }
            }
            if worker.is_finished() {
                let failure = worker.join().unwrap().err();
                panic!("compiler exited before recording children: {failure:?}");
            }
            assert!(before.elapsed() < Duration::from_secs(3));
            std::thread::sleep(Duration::from_millis(5));
        };
        let lines: Vec<_> = trace.lines().collect();
        if cancel {
            token.cancel();
        }
        let failure = worker
            .join()
            .unwrap()
            .err()
            .expect("must not publish a PDF");
        assert_eq!(failure.code, if cancel { "CANCELED" } else { "TIMEOUT" });
        assert!(before.elapsed() < Duration::from_secs(4));
        assert!(
            !std::path::Path::new(lines[0]).exists(),
            "compile directory remains"
        );
        // macOS reaps both processes. A stopped Linux orphan may remain a
        // zombie until init reaps it, but it must no longer execute or hold pipes.
        for pid in &lines[1..] {
            let output = std::process::Command::new("/bin/ps")
                .args(["-o", "stat=", "-p", pid])
                .output()
                .unwrap();
            let status = String::from_utf8_lossy(&output.stdout);
            assert!(
                status.trim().is_empty() || status.trim().starts_with('Z'),
                "child remains active: {status}"
            );
        }
    }
}
