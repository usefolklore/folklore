// folklore — macOS menubar client
//
// A lightweight status-bar agent (LSUIElement, no Dock icon) that surfaces the
// local folklore node the way uTorrent or Ollama surface theirs: a glyph in the
// menubar whose fill tracks the daemon, and a dropdown that shows what the node
// holds, who it is connected to, and what it has contributed to the network —
// plus one-click daemon control and shortcuts into the live feed and graph.
//
// It reads a compact snapshot written by status.cjs (~/.folklore/menubar-status.json)
// so opening the menu never blocks on a graph parse; a background timer refreshes
// the snapshot. Daemon start/stop/restart shell out to the folklore CLI.
//
// Build: ./build.sh  → folklore.app (see README).

import AppKit
import Darwin
import Foundation

// MARK: - Paths

/// Resolved once. FOLKLORE_HOME overrides; else ~/.folklore.
let folkloreHome: String = {
    if let h = ProcessInfo.processInfo.environment["FOLKLORE_HOME"], !h.isEmpty { return h }
    return (NSHomeDirectory() as NSString).appendingPathComponent(".folklore")
}()

/// node binary — env override, else the usual homebrew / system spots.
let nodeBin: String = {
    if let n = ProcessInfo.processInfo.environment["FOLKLORE_NODE"], !n.isEmpty { return n }
    for c in ["/opt/homebrew/bin/node", "/usr/local/bin/node", "/usr/bin/node"] {
        if FileManager.default.isExecutableFile(atPath: c) { return c }
    }
    return "node"
}()

/// folklore CLI entry (bin/folklore.js). FOLKLORE_BIN overrides; else resolved
/// relative to this app bundle's install dir, else a `folklore` on PATH.
let folkloreBin: String? = {
    if let b = ProcessInfo.processInfo.environment["FOLKLORE_BIN"], !b.isEmpty { return b }
    return nil
}()

/// status.cjs probe — env override, else alongside this source at install time.
let statusProbe: String = {
    if let s = ProcessInfo.processInfo.environment["FOLKLORE_STATUS_PROBE"], !s.isEmpty { return s }
    let resDir = Bundle.main.resourcePath ?? "."
    return (resDir as NSString).appendingPathComponent("status.cjs")
}()

// MARK: - Snapshot

struct Snapshot: Decodable {
    var daemon: String = "off"
    var pid: Int?
    var peers_connected: Int = 0
    var peers_roster: Int = 0
    var nodes: Int = 0
    var edges: Int = 0
    var vectors: Int = 0
    var identity: String?
    var reputation: Int = 0
    var peers_helped: Int = 0
    var last_served_peer: String?
    var last_served_ago_ms: Double?
}

func loadSnapshot() -> Snapshot {
    let p = (folkloreHome as NSString).appendingPathComponent("menubar-status.json")
    guard let data = FileManager.default.contents(atPath: p),
          let snap = try? JSONDecoder().decode(Snapshot.self, from: data)
    else { return Snapshot() }
    return snap
}

// MARK: - Shell helpers

/// Run a command detached (fire-and-forget) — used for daemon control + probe.
@discardableResult
func run(_ launchPath: String, _ args: [String], wait: Bool = false) -> Int32 {
    let task = Process()
    task.executableURL = URL(fileURLWithPath: launchPath)
    task.arguments = args
    var env = ProcessInfo.processInfo.environment
    env["FOLKLORE_HOME"] = folkloreHome
    task.environment = env
    do {
        try task.run()
    } catch {
        return -1
    }
    if wait { task.waitUntilExit(); return task.terminationStatus }
    return 0
}

func refreshProbe() {
    // Writes menubar-status.json; runs off the main thread.
    DispatchQueue.global(qos: .utility).async {
        run(nodeBin, [statusProbe], wait: true)
        DispatchQueue.main.async { (NSApp.delegate as? AppDelegate)?.rebuild() }
    }
}

func daemon(_ sub: String) {
    guard let bin = folkloreBin else { return }
    DispatchQueue.global(qos: .userInitiated).async {
        _ = run(nodeBin, [bin, "daemon", sub], wait: true)
        refreshProbe()
    }
}

// MARK: - App

final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private var statusItem: NSStatusItem!
    private var timer: Timer?
    private var snap = Snapshot()
    private var island: ActivityIslandController?
    private var previewSignal: DispatchSourceSignal?

    func applicationDidFinishLaunching(_ notification: Notification) {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        let menu = NSMenu()
        menu.delegate = self
        statusItem.menu = menu
        if ProcessInfo.processInfo.environment["FOLKLORE_ISLAND"] != "0" {
            island = ActivityIslandController()
            signal(SIGUSR1, SIG_IGN)
            let source = DispatchSource.makeSignalSource(signal: SIGUSR1, queue: .main)
            source.setEventHandler { [weak self] in self?.island?.preview() }
            source.resume()
            previewSignal = source
        }
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(screenParametersChanged),
            name: NSApplication.didChangeScreenParametersNotification,
            object: nil
        )
        rebuild()
        refreshProbe()
        // Refresh every 4s while the app lives — cheap (mtime-memoised graph read).
        timer = Timer.scheduledTimer(withTimeInterval: 4, repeats: true) { _ in refreshProbe() }
    }

    // Icon reflects daemon state: connected glyph when up, slashed when down.
    private func applyIcon() {
        guard let button = statusItem.button else { return }
        let up = snap.daemon == "on"
        let fallback = NSImage(systemSymbolName: up ? "flame.fill" : "flame", accessibilityDescription: "folklore")?
            .withSymbolConfiguration(NSImage.SymbolConfiguration(pointSize: 15, weight: .regular))
        fallback?.isTemplate = true
        let img = folkloreMenuImage() ?? fallback
        button.image = img
        button.appearsDisabled = !up
    }

    // Rebuilt from the latest snapshot on every open + timer tick.
    func rebuild() {
        snap = loadSnapshot()
        island?.update(snap)
        applyIcon()
        guard let menu = statusItem.menu else { return }
        menu.removeAllItems()

        let running = snap.daemon == "on"
        // Header — name + identity.
        let title = snap.identity.map { "folklore · \($0)" } ?? "folklore"
        menu.addItem(disabled(title, bold: true))
        menu.addItem(disabled(running
            ? "● running · \(snap.peers_connected) peer\(snap.peers_connected == 1 ? "" : "s") connected"
            : (snap.daemon == "stale" ? "○ daemon stale" : "○ daemon stopped")))

        menu.addItem(.separator())

        // What the node holds.
        menu.addItem(disabled("📊  \(fmt(snap.nodes)) nodes · \(fmt(snap.edges)) edges"))
        menu.addItem(disabled("🔍  \(fmt(snap.vectors)) vectors indexed"))
        menu.addItem(disabled("🌐  \(snap.peers_roster) peer\(snap.peers_roster == 1 ? "" : "s") known"))

        // What the node has given back.
        if snap.reputation > 0 || snap.peers_helped > 0 {
            menu.addItem(disabled("🏅  \(snap.reputation) rep · helped \(snap.peers_helped) peer\(snap.peers_helped == 1 ? "" : "s")"))
        }
        if let p = snap.last_served_peer, let ago = snap.last_served_ago_ms, ago < 120_000 {
            menu.addItem(disabled("⚡  answered \(p) \(agoLabel(ago))"))
        }

        menu.addItem(.separator())

        // Windows into the node.
        menu.addItem(action("Open Live Feed", #selector(openLiveFeed)))
        menu.addItem(action("Open Graph", #selector(openGraph)))
        if island != nil {
            menu.addItem(action("Preview Activity Island", #selector(previewIsland)))
        }

        menu.addItem(.separator())

        // Daemon control — contextual.
        if running {
            menu.addItem(action("Restart Daemon", #selector(restartDaemon)))
            menu.addItem(action("Stop Daemon", #selector(stopDaemon)))
        } else {
            menu.addItem(action("Start Daemon", #selector(startDaemon)))
        }
        menu.addItem(action("Settings…", #selector(openSettings)))

        menu.addItem(.separator())
        menu.addItem(action("Quit folklore", #selector(quit)))
    }

    func menuNeedsUpdate(_ menu: NSMenu) { rebuild() }

    @objc private func screenParametersChanged() {
        island?.screenParametersChanged()
    }

    // MARK: item builders

    private func disabled(_ s: String, bold: Bool = false) -> NSMenuItem {
        let it = NSMenuItem(title: s, action: nil, keyEquivalent: "")
        it.isEnabled = false
        if bold {
            it.attributedTitle = NSAttributedString(
                string: s,
                attributes: [.font: NSFont.boldSystemFont(ofSize: NSFont.systemFontSize)])
        }
        return it
    }

    private func action(_ s: String, _ sel: Selector) -> NSMenuItem {
        let it = NSMenuItem(title: s, action: sel, keyEquivalent: "")
        it.target = self
        return it
    }

    // MARK: actions

    @objc private func startDaemon() { daemon("start") }
    @objc private func stopDaemon() { daemon("stop") }
    @objc private func restartDaemon() {
        DispatchQueue.global(qos: .userInitiated).async {
            if let bin = folkloreBin {
                _ = run(nodeBin, [bin, "daemon", "stop"], wait: true)
                _ = run(nodeBin, [bin, "daemon", "start"], wait: true)
            }
            refreshProbe()
        }
    }

    @objc private func openLiveFeed() {
        // Open a Terminal window tailing the served feed via the CLI.
        guard let bin = folkloreBin else { return }
        let cmd = "\(shq(nodeBin)) \(shq(bin)) live"
        let script = "tell application \"Terminal\" to do script \"\(cmd)\"\ntell application \"Terminal\" to activate"
        run("/usr/bin/osascript", ["-e", script])
    }

    @objc private func openGraph() {
        let p = (folkloreHome as NSString).appendingPathComponent("graph.html")
        if FileManager.default.fileExists(atPath: p) {
            NSWorkspace.shared.open(URL(fileURLWithPath: p))
        }
    }

    @objc private func previewIsland() { island?.preview() }

    @objc private func openSettings() {
        let p = (folkloreHome as NSString).appendingPathComponent("config.yaml")
        NSWorkspace.shared.open(URL(fileURLWithPath: p))
    }

    @objc private func quit() { NSApp.terminate(nil) }
}

// MARK: - Formatting

func fmt(_ n: Int) -> String {
    let f = NumberFormatter()
    f.numberStyle = .decimal
    return f.string(from: NSNumber(value: n)) ?? String(n)
}

func agoLabel(_ ms: Double) -> String {
    let s = Int(ms / 1000)
    if s < 60 { return "\(s)s ago" }
    return "\(s / 60)m ago"
}

/// Shell-quote for the osascript `do script` payload.
func shq(_ s: String) -> String { "'" + s.replacingOccurrences(of: "'", with: "'\\''") + "'" }

// MARK: - Entry

let app = NSApplication.shared
app.setActivationPolicy(.accessory) // LSUIElement equivalent — menubar only.
let delegate = AppDelegate()
app.delegate = delegate
app.run()
