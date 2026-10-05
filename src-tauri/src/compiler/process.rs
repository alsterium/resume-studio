use std::{
    io::{self, Read},
    process::{Command, Stdio},
    thread,
    time::{Duration, Instant},
};

const LOG_LIMIT: usize = 64 * 1024;

pub struct ProcessOutput {
    pub success: bool,
    pub timed_out: bool,
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

pub fn run(mut command: Command, timeout: Duration) -> io::Result<ProcessOutput> {
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    let mut child = command
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()?;
    let stdout = child.stdout.take().expect("piped stdout");
    let stderr = child.stderr.take().expect("piped stderr");
    let out = thread::spawn(move || drain(stdout));
    let err = thread::spawn(move || drain(stderr));
    let started = Instant::now();
    let (status, timed_out) = loop {
        if let Some(status) = child.try_wait()? {
            break (status, false);
        }
        if started.elapsed() >= timeout {
            #[cfg(unix)]
            // Each command owns a fresh process group; stop TeX descendants as well.
            unsafe {
                libc::kill(-(child.id() as i32), libc::SIGKILL);
            }
            let _ = child.kill();
            break (child.wait()?, true);
        }
        thread::sleep(Duration::from_millis(20));
    };
    let join = |handle: thread::JoinHandle<io::Result<String>>| {
        handle
            .join()
            .map_err(|_| io::Error::other("log reader panicked"))?
    };
    Ok(ProcessOutput {
        success: status.success(),
        timed_out,
        stdout: join(out)?,
        stderr: join(err)?,
    })
}

#[cfg(all(test, unix))]
mod tests {
    use super::*;

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
