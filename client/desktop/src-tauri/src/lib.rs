// Folklore desktop — cross-platform tray shell + onboard wizard.
//
// The heavy lifting lives in the Node CLI (`@usefolklore/folklore`): daemon,
// MCP server, and the `onboard` wizard that wires every AI provider on the
// machine. This shell provides the GUI: a tray icon, a window that runs onboard
// with no terminal, and daemon controls. One codebase → macOS / Windows / Linux.

use std::process::Command;
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};

/// Resolve the `folklore` CLI. A GUI app on macOS does not inherit the shell
/// PATH, so we probe the usual global-install locations before falling back to
/// PATH and then `npx`. Returns (program, leading-args).
fn folklore_cli() -> (String, Vec<String>) {
    let mut candidates: Vec<String> = Vec::new();
    if let Ok(home) = std::env::var("HOME") {
        candidates.push(format!("{home}/.npm-global/bin/folklore"));
        candidates.push(format!("{home}/.local/bin/folklore"));
    }
    for p in [
        "/opt/homebrew/bin/folklore",
        "/usr/local/bin/folklore",
        "/usr/bin/folklore",
    ] {
        candidates.push(p.to_string());
    }
    for c in candidates {
        if std::path::Path::new(&c).exists() {
            return (c, vec![]);
        }
    }
    // PATH (works when launched from a shell) then npx as a last resort so the
    // wizard can still run on a machine that only has Node.
    if which("folklore") {
        return ("folklore".into(), vec![]);
    }
    let npx = if cfg!(target_os = "windows") { "npx.cmd" } else { "npx" };
    (npx.into(), vec!["--yes".into(), "@usefolklore/folklore".into()])
}

fn which(bin: &str) -> bool {
    let (probe, arg) = if cfg!(target_os = "windows") {
        ("where", bin)
    } else {
        ("which", bin)
    };
    Command::new(probe)
        .arg(arg)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn run_cli(sub: &[&str]) -> Result<String, String> {
    let (program, mut args) = folklore_cli();
    for s in sub {
        args.push((*s).to_string());
    }
    let out = Command::new(&program)
        .args(&args)
        .output()
        .map_err(|e| format!("failed to launch folklore CLI ({program}): {e}"))?;
    let stdout = String::from_utf8_lossy(&out.stdout).to_string();
    let stderr = String::from_utf8_lossy(&out.stderr).to_string();
    if out.status.success() {
        Ok(if stdout.trim().is_empty() { stderr } else { stdout })
    } else {
        Err(if stderr.trim().is_empty() { stdout } else { stderr })
    }
}

/// Run the full onboard wizard non-interactively: identity, Claude Code hooks,
/// every detected AI provider, and start the daemon. This is the "download
/// installs everything — no command" path, driven from the GUI.
#[tauri::command]
fn run_onboard() -> Result<String, String> {
    run_cli(&["onboard", "--yes", "--no-sessions"])
}

/// The provider-integration table (which harnesses are detected / wired).
#[tauri::command]
fn harness_list() -> Result<String, String> {
    run_cli(&["harness", "list"])
}

#[tauri::command]
fn daemon_status() -> Result<String, String> {
    run_cli(&["daemon", "status"])
}

#[tauri::command]
fn daemon_start() -> Result<String, String> {
    run_cli(&["daemon", "start"])
}

#[tauri::command]
fn daemon_stop() -> Result<String, String> {
    run_cli(&["daemon", "stop"])
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open Folklore", true, None::<&str>)?;
    let onboard = MenuItem::with_id(app, "onboard", "Run Setup Wizard", true, None::<&str>)?;
    let start = MenuItem::with_id(app, "start", "Start Daemon", true, None::<&str>)?;
    let stop = MenuItem::with_id(app, "stop", "Stop Daemon", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &onboard, &start, &stop, &quit])?;

    TrayIconBuilder::with_id("folklore-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .tooltip("Folklore")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => {
                if let Some(w) = app.get_webview_window("main") {
                    let _ = w.show();
                    let _ = w.set_focus();
                }
            }
            "onboard" => {
                let _ = run_onboard();
            }
            "start" => {
                let _ = daemon_start();
            }
            "stop" => {
                let _ = daemon_stop();
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            run_onboard,
            harness_list,
            daemon_status,
            daemon_start,
            daemon_stop
        ])
        .setup(|app| {
            build_tray(app)?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Folklore");
}
