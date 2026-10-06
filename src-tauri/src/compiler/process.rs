use super::cancellation::Cancellation;
use std::{
    io::{self, Read},
    process::{Child, Command, Stdio},
    thread,
    time::{Duration, Instant},
};

const LOG_LIMIT: usize = 64 * 1024;

pub struct ProcessOutput {
    pub success: bool,
    pub timed_out: bool,
    pub cancelled: bool,
    pub stdout: String,
    pub stderr: String,
}

fn drain(mut reader: impl Read) -> io::Result<String> {
    let mut kept = Vec::new();
    let mut buffer = [0; 8192];
    loop {
        let size = reader.read(&mut buffer)?;
        if size == 0 {
            break;
        }
        let count = size.min(LOG_LIMIT.saturating_sub(kept.len()));
        kept.extend_from_slice(&buffer[..count]);
    }
    Ok(String::from_utf8_lossy(&kept).into_owned())
}

struct OwnedChild {
    child: Child,
    stopped: bool,
}
impl OwnedChild {
    fn stop(&mut self) {
        if self.stopped {
            return;
        }
        self.stopped = true;
        #[cfg(unix)]
        // Only the process group created for this command is addressed.
        unsafe {
            libc::kill(-(self.child.id() as i32), libc::SIGKILL);
        }
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}
impl Drop for OwnedChild {
    fn drop(&mut self) {
        self.stop();
    }
}

pub fn run(command: Command, timeout: Duration) -> io::Result<ProcessOutput> {
    run_cancellable(command, timeout, &Cancellation::default())
}

pub fn run_cancellable(
    mut command: Command,
    timeout: Duration,
    cancellation: &Cancellation,
) -> io::Result<ProcessOutput> {
    if cancellation.is_cancelled() {
        return Ok(ProcessOutput {
            success: false,
            timed_out: false,
            cancelled: true,
            stdout: String::new(),
            stderr: String::new(),
        });
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = OwnedChild {
        child: command
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()?,
        stopped: false,
    };
    let stdout = child.child.stdout.take().expect("piped stdout");
    let stderr = child.child.stderr.take().expect("piped stderr");
    let out = thread::spawn(move || drain(stdout));
    let err = thread::spawn(move || drain(stderr));
    let started = Instant::now();
    let (success, timed_out, cancelled) = loop {
        let cancelled = cancellation.is_cancelled();
        let timed_out = started.elapsed() >= timeout;
        if cancelled || timed_out {
            break (false, !cancelled && timed_out, cancelled);
        }
        if let Some(status) = child.child.try_wait()? {
            break (status.success(), false, false);
        }
        thread::sleep(Duration::from_millis(20));
    };
    // Stop descendants even when the parent has exited, before joining readers
    // whose pipes could otherwise be held open indefinitely by a descendant.
    child.stop();
    let join = |handle: thread::JoinHandle<io::Result<String>>| {
        handle
            .join()
            .map_err(|_| io::Error::other("log reader panicked"))?
    };
    Ok(ProcessOutput {
        success,
        timed_out,
        cancelled,
        stdout: join(out)?,
        stderr: join(err)?,
    })
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

    #[test]
    fn exited_parent_does_not_leave_a_descendant_holding_output_pipes() {
        let mut command = Command::new("/bin/sh");
        command.args(["-c", "sleep 30 & exit 0"]);
        let started = Instant::now();
        let output = run(command, Duration::from_secs(3)).unwrap();
        assert!(output.success);
        assert!(!output.timed_out && !output.cancelled);
        assert!(started.elapsed() < Duration::from_secs(2));
    }

    #[test]
    fn timeout_stops_descendants_that_hold_the_output_pipes() {
        let mut command = Command::new("/bin/sh");
        command.args(["-c", "sleep 30 & wait"]);
        let started = Instant::now();
        let output = run(command, Duration::from_millis(100)).unwrap();
        assert!(output.timed_out);
        assert!(!output.success);
        assert!(started.elapsed() < Duration::from_secs(3));
    }

    #[test]
    fn drains_large_output_while_retaining_a_bounded_log() {
        let mut command = Command::new("/bin/sh");
        command.args([
            "-c",
            "head -c 131072 /dev/zero; head -c 131072 /dev/zero >&2",
        ]);
        let output = run(command, Duration::from_secs(3)).unwrap();
        assert!(output.success);
        assert!(!output.timed_out);
        assert_eq!(output.stdout.len(), LOG_LIMIT);
        assert_eq!(output.stderr.len(), LOG_LIMIT);
    }
}
