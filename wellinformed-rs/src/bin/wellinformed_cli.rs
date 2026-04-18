//! wellinformed-cli — native Rust client for the v4.1 IPC fast path.
//!
//! v4.0 ships `bin/wellinformed.js` which checks for the daemon socket
//! BEFORE importing the dist CLI. That collapses ONNX-load + sqlite-
//! reopen costs but still pays the ~200 ms Node startup floor on every
//! invocation. v4.1's native client collapses that floor too: a Rust
//! binary cold-starts in <5 ms, runs a single Unix-socket round trip,
//! and exits.
//!
//! Cold-CLI ask path with this binary:
//!   - native CLI cold start:  ~5 ms
//!   - socket connect:         ~1 ms
//!   - daemon-side cache hit:  ~1 ms (Phase 5)
//!   - response stream + exit: ~3 ms
//!   = ~10–15 ms end-to-end vs ~100 ms via the JS shim
//!
//! Fallback: when the daemon socket isn't present (or the requested
//! command isn't IPC-delegatable), exec `node bin/wellinformed.js`
//! with the same argv. Operators see no behavioral change either way.

use std::env;
use std::io::{BufRead, BufReader, Write};
use std::os::unix::net::UnixStream;
use std::path::PathBuf;
use std::process::{exit, Command};
use std::time::Duration;

use serde::{Deserialize, Serialize};

const IPC_DELEGATABLE: &[&str] = &["ask", "stats", "cache-stats"];
const IPC_TIMEOUT_MS: u64 = 5000;

#[derive(Serialize)]
struct IpcRequest<'a> {
    id: u64,
    cmd: &'a str,
    args: &'a [String],
}

#[derive(Deserialize)]
#[allow(dead_code)]
struct IpcResponse {
    id: u64,
    ok: bool,
    #[serde(default)]
    stdout: Option<String>,
    #[serde(default)]
    stderr: Option<String>,
    #[serde(default)]
    exit: Option<i32>,
}

fn wellinformed_home() -> PathBuf {
    env::var_os("WELLINFORMED_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            let home = env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("/"));
            home.join(".wellinformed")
        })
}

fn socket_path() -> PathBuf {
    wellinformed_home().join("daemon.sock")
}

fn try_ipc(cmd: &str, args: &[String]) -> Option<IpcResponse> {
    let path = socket_path();
    if !path.exists() {
        return None;
    }
    let mut stream = match UnixStream::connect(&path) {
        Ok(s) => s,
        Err(_) => return None,
    };
    // Set both read + write timeouts so a hung daemon can't pin us.
    let _ = stream.set_read_timeout(Some(Duration::from_millis(IPC_TIMEOUT_MS)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(IPC_TIMEOUT_MS)));

    let req = IpcRequest {
        // Microsecond timestamp ID — matches the Node client's
        // Date.now() shape closely enough for daemon-side correlation.
        id: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0),
        cmd,
        args,
    };
    let body = match serde_json::to_string(&req) {
        Ok(s) => s,
        Err(_) => return None,
    };
    if stream.write_all(body.as_bytes()).is_err() {
        return None;
    }
    if stream.write_all(b"\n").is_err() {
        return None;
    }

    let mut reader = BufReader::new(stream);
    let mut line = String::new();
    if reader.read_line(&mut line).is_err() || line.is_empty() {
        return None;
    }
    serde_json::from_str::<IpcResponse>(line.trim()).ok()
}

fn fallback_to_node(argv: &[String]) -> ! {
    // Locate bin/wellinformed.js relative to this binary. The standard
    // layout is:
    //   <repo>/wellinformed-rs/target/release/wellinformed-cli
    //   <repo>/bin/wellinformed.js
    // ↑ four ancestors: target → release → wellinformed-rs → repo root
    let exe = env::current_exe().unwrap_or_else(|_| PathBuf::from("./wellinformed-cli"));
    let mut node_entry = exe.clone();
    for _ in 0..4 {
        if let Some(parent) = node_entry.parent() {
            node_entry = parent.to_path_buf();
        }
    }
    node_entry.push("bin");
    node_entry.push("wellinformed.js");

    if !node_entry.exists() {
        eprintln!(
            "wellinformed-cli: fallback path {} does not exist",
            node_entry.display()
        );
        exit(2);
    }

    let status = Command::new("node")
        .arg(&node_entry)
        .args(&argv[1..])
        .status();
    match status {
        Ok(s) => exit(s.code().unwrap_or(1)),
        Err(e) => {
            eprintln!("wellinformed-cli: failed to exec node: {e}");
            exit(2);
        }
    }
}

fn main() {
    let argv: Vec<String> = env::args().collect();
    if argv.len() < 2 {
        // No command — fall through to node so it prints the help.
        fallback_to_node(&argv);
    }

    let cmd = &argv[1];
    let rest: Vec<String> = argv[2..].to_vec();

    if IPC_DELEGATABLE.iter().any(|c| c == cmd) {
        if let Some(resp) = try_ipc(cmd, &rest) {
            // Sentinel: the daemon may respond with stderr=__fallback__
            // when the command isn't actually in its handler registry
            // (covers protocol drift between the native client's known-
            // delegatable list and the daemon's actual handler set).
            if matches!(resp.stderr.as_deref(), Some("__fallback__")) {
                fallback_to_node(&argv);
            }
            if let Some(out) = resp.stdout {
                let _ = std::io::stdout().write_all(out.as_bytes());
            }
            if let Some(err_text) = resp.stderr {
                let _ = std::io::stderr().write_all(err_text.as_bytes());
            }
            exit(resp.exit.unwrap_or(if resp.ok { 0 } else { 1 }));
        }
        // No socket OR connect failed — fall through to node.
    }

    fallback_to_node(&argv);
}
