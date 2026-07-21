// Folklore desktop — cross-platform tray shell + onboard wizard.
//
// The heavy lifting lives in the Node CLI (`@usefolklore/folklore`): daemon,
// MCP server, and the `onboard` wizard that wires every AI provider on the
// machine. This shell provides the GUI: a tray icon, a window that runs onboard
// with no terminal, and daemon controls. One codebase → macOS / Windows / Linux.

use std::path::{Path, PathBuf};
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

/// `which`/`where` lookup that returns the resolved absolute path.
fn which_path(bin: &str) -> Option<String> {
    let (probe, arg) = if cfg!(target_os = "windows") { ("where", bin) } else { ("which", bin) };
    let out = Command::new(probe).arg(arg).output().ok()?;
    if !out.status.success() { return None; }
    String::from_utf8_lossy(&out.stdout).lines().next().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

// ─────────────── bundled Node runtime ───────────────

/// The Node binary bundled into the app (populated per-platform by the desktop
/// CI), if present. Unix dist: node/bin/node ; Windows: node/node.exe.
fn bundled_node(app: &AppHandle) -> Option<PathBuf> {
    let res = app.path().resource_dir().ok()?;
    let unix = res.join("node").join("bin").join("node");
    if unix.exists() { return Some(unix); }
    let win = res.join("node").join("node.exe");
    if win.exists() { return Some(win); }
    None
}

/// npm's cli.js inside the bundled dist. The dist's `bin/npm`/`bin/npx` symlinks
/// get flattened by the app bundler into mis-located copies that fail to resolve
/// npm's lib, so we always invoke npm-cli.js directly with the bundled node. Unix
/// keeps npm under lib/, Windows at the dist root.
fn bundled_npm_cli(app: &AppHandle) -> Option<PathBuf> {
    let res = app.path().resource_dir().ok()?;
    for p in [
        res.join("node/lib/node_modules/npm/bin/npm-cli.js"),
        res.join("node/node_modules/npm/bin/npm-cli.js"),
    ] {
        if p.exists() { return Some(p); }
    }
    None
}

/// The installed CLI entry script under `prefix`, if present. npm's global layout
/// is `lib/node_modules/...` on unix, `node_modules/...` on Windows.
fn installed_cli_entry(prefix: &Path) -> Option<PathBuf> {
    for p in [
        prefix.join("lib/node_modules/@usefolklore/folklore/bin/folklore.js"),
        prefix.join("node_modules/@usefolklore/folklore/bin/folklore.js"),
    ] {
        if p.exists() { return Some(p); }
    }
    None
}

/// PATH for spawned children: bundled Node bin dir first (so npm post-install
/// scripts find `node`), then version-manager / global dirs, then the inherited
/// PATH.
fn child_path(app: &AppHandle) -> String {
    let sep = if cfg!(target_os = "windows") { ";" } else { ":" };
    let mut parts: Vec<String> = Vec::new();
    if let Some(node) = bundled_node(app) {
        if let Some(dir) = node.parent() {
            parts.push(dir.to_string_lossy().to_string());
        }
    }
    parts.extend(bin_dirs());
    if let Ok(existing) = std::env::var("PATH") {
        parts.push(existing);
    }
    parts.join(sep)
}

/// Ensure the folklore CLI is installed against the bundled Node, returning
/// (node, entry-js). Installs once into app data on first run (~20s, fetching the
/// platform's native prebuilds); a no-op afterward. Running the entry `.js`
/// directly with node sidesteps the unreliable bundled bin symlinks — this is the
/// verified zero-system-Node path.
fn ensure_bundled_cli(app: &AppHandle) -> Option<(PathBuf, PathBuf)> {
    let node = bundled_node(app)?;
    let npm_cli = bundled_npm_cli(app)?;
    let prefix = app.path().app_data_dir().ok()?.join("cli");
    if let Some(entry) = installed_cli_entry(&prefix) {
        return Some((node, entry));
    }
    let _ = std::fs::create_dir_all(&prefix);
    let status = Command::new(&node)
        .arg(&npm_cli)
        .args(["install", "-g", "@usefolklore/folklore", "--no-audit", "--no-fund", "--prefix"])
        .arg(&prefix)
        .env("PATH", child_path(app))
        .status()
        .ok()?;
    if !status.success() { return None; }
    installed_cli_entry(&prefix).map(|entry| (node, entry))
}

/// Resolve and run a folklore CLI subcommand. Order: a system-installed
/// `folklore` (fastest); else the bundled Node running the app-installed CLI
/// (zero system Node); else system `npx` on the published package; else a clear
/// "install Node" error.
fn run_cli(app: &AppHandle, sub: &[&str]) -> Result<String, String> {
    let (program, mut args): (String, Vec<String>) =
        if let Some(f) = find_in_dirs("folklore").or_else(|| which_path("folklore")) {
            (f, vec![])
        } else if let Some((node, entry)) = ensure_bundled_cli(app) {
            (node.to_string_lossy().to_string(), vec![entry.to_string_lossy().to_string()])
        } else if let Some(npx) = find_in_dirs("npx").or_else(|| which_path("npx")) {
            (npx, vec!["--yes".into(), "@usefolklore/folklore".into()])
        } else {
            return Err("Node.js was not found and this build has no bundled runtime. \
                        Install Node (nodejs.org) or the folklore CLI \
                        (npm i -g @usefolklore/folklore), then try again."
                .into());
        };
    for s in sub {
        args.push((*s).to_string());
    }
    let out = Command::new(&program)
        .args(&args)
        .env("PATH", child_path(app))
        .output()
        .map_err(|e| format!("Could not run the folklore CLI ({program}): {e}"))?;
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
