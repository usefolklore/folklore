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
    AppHandle, Manager,
};

/// Directories where a globally-installed `folklore` / `node` / `npx` might live.
/// A double-clicked GUI app inherits neither the shell PATH nor version-manager
/// shims (nvm / fnm / volta / asdf), so we have to look ourselves. Ordered most-
/// to least specific; version-manager dirs are expanded by globbing their
/// `versions/node/*/bin` roots.
fn bin_dirs() -> Vec<String> {
    let mut dirs: Vec<String> = Vec::new();
    if let Ok(home) = std::env::var("HOME") {
        // Global npm prefixes.
        dirs.push(format!("{home}/.npm-global/bin"));
        dirs.push(format!("{home}/.local/bin"));
        dirs.push(format!("{home}/.volta/bin"));
        dirs.push(format!("{home}/.bun/bin"));
        // nvm / fnm keep a bin dir per installed node version — glob the newest.
        for base in [
            format!("{home}/.nvm/versions/node"),
            format!("{home}/.local/share/fnm/node-versions"),
            format!("{home}/Library/Application Support/fnm/node-versions"),
        ] {
            if let Ok(entries) = std::fs::read_dir(&base) {
                let mut versions: Vec<String> = entries
                    .filter_map(|e| e.ok().map(|e| e.path().to_string_lossy().to_string()))
                    .collect();
                versions.sort();
                if let Some(latest) = versions.last() {
                    dirs.push(format!("{latest}/bin"));         // nvm layout
                    dirs.push(format!("{latest}/installation/bin")); // fnm layout
                }
            }
        }
    }
    for p in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"] {
        dirs.push(p.to_string());
    }
    dirs
}

/// First `<dir>/<name>` (or `<name>.cmd` on Windows) that exists.
fn find_in_dirs(name: &str) -> Option<String> {
    let names: Vec<String> = if cfg!(target_os = "windows") {
        vec![format!("{name}.cmd"), format!("{name}.exe"), name.to_string()]
    } else {
        vec![name.to_string()]
    };
    for dir in bin_dirs() {
        for n in &names {
            let cand = format!("{dir}/{n}");
            if std::path::Path::new(&cand).exists() {
                return Some(cand);
            }
        }
    }
    None
}

/// Resolve how to run the folklore CLI. Prefer a globally-installed `folklore`
/// binary (fast, exact version); otherwise resolve `npx` (across the same set of
/// locations) and run the published package. Returns (program, leading-args), or
/// an error string if no Node tooling can be found at all.
fn folklore_cli() -> Result<(String, Vec<String>), String> {
    if let Some(folklore) = find_in_dirs("folklore").or_else(|| which_path("folklore")) {
        return Ok((folklore, vec![]));
    }
    // Bare `npx` so it resolves against the child PATH we set in run_cli — that
    // PATH includes the app's bundled Node runtime, so this works even with no
    // system Node at all.
    Ok(("npx".into(), vec!["--yes".into(), "@usefolklore/folklore".into()]))
}

/// The `bin` directory of the Node runtime bundled into the app, if present.
/// Populated per-platform by the desktop CI (a clean Node dist under
/// `resources/node`). Prepending this to the child PATH is what makes the
/// wizard run with zero Node installed on the machine.
fn bundled_node_bin(app: &AppHandle) -> Option<String> {
    let res = app.path().resource_dir().ok()?;
    // Unix Node dist: node/bin/node ; Windows dist: node/node.exe at the root.
    let unix = res.join("node").join("bin");
    if unix.join("node").exists() {
        return Some(unix.to_string_lossy().to_string());
    }
    let win = res.join("node");
    if win.join("node.exe").exists() {
        return Some(win.to_string_lossy().to_string());
    }
    None
}

/// PATH for spawned CLI children: the bundled Node bin dir (if any) first, then
/// the version-manager / global-install dirs, then the inherited PATH. This
/// single PATH lets bare `npx`/`node` resolve to the bundle or the system.
fn child_path(app: &AppHandle) -> String {
    let sep = if cfg!(target_os = "windows") { ";" } else { ":" };
    let mut parts: Vec<String> = Vec::new();
    if let Some(b) = bundled_node_bin(app) {
        parts.push(b);
    }
    parts.extend(bin_dirs());
    if let Ok(existing) = std::env::var("PATH") {
        parts.push(existing);
    }
    parts.join(sep)
}

/// `which`/`where` lookup that returns the resolved absolute path.
fn which_path(bin: &str) -> Option<String> {
    let (probe, arg) = if cfg!(target_os = "windows") { ("where", bin) } else { ("which", bin) };
    let out = Command::new(probe).arg(arg).output().ok()?;
    if !out.status.success() { return None; }
    String::from_utf8_lossy(&out.stdout).lines().next().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

fn run_cli(app: &AppHandle, sub: &[&str]) -> Result<String, String> {
    let (program, mut args) = folklore_cli()?;
    for s in sub {
        args.push((*s).to_string());
    }
    let out = Command::new(&program)
        .args(&args)
        .env("PATH", child_path(app))
        .output()
        .map_err(|e| {
            format!(
                "Could not run the folklore CLI ({program}): {e}. If this build \
                 has no bundled Node runtime, install Node (nodejs.org) or the CLI \
                 (npm i -g @usefolklore/folklore) and try again."
            )
        })?;
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
fn run_onboard(app: AppHandle) -> Result<String, String> {
    run_cli(&app, &["onboard", "--yes", "--no-sessions"])
}

/// The provider-integration table (which harnesses are detected / wired).
#[tauri::command]
fn harness_list(app: AppHandle) -> Result<String, String> {
    run_cli(&app, &["harness", "list"])
}

#[tauri::command]
fn daemon_status(app: AppHandle) -> Result<String, String> {
    run_cli(&app, &["daemon", "status"])
}

#[tauri::command]
fn daemon_start(app: AppHandle) -> Result<String, String> {
    run_cli(&app, &["daemon", "start"])
}

#[tauri::command]
fn daemon_stop(app: AppHandle) -> Result<String, String> {
    run_cli(&app, &["daemon", "stop"])
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
                let _ = run_cli(app, &["onboard", "--yes", "--no-sessions"]);
            }
            "start" => {
                let _ = run_cli(app, &["daemon", "start"]);
            }
            "stop" => {
                let _ = run_cli(app, &["daemon", "stop"]);
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
