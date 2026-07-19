import AppKit
import Foundation

// MARK: - Shared brand assets

private func bundledImage(named name: String) -> NSImage? {
    guard let resources = Bundle.main.resourcePath else { return nil }
    return NSImage(contentsOfFile: (resources as NSString).appendingPathComponent(name))
}

func folkloreMenuImage() -> NSImage? {
    guard let image = bundledImage(named: "folklore-navbar.svg") ?? bundledImage(named: "folklore-logo.svg")
    else { return nil }
    image.size = NSSize(width: 18, height: 18)
    image.isTemplate = true
    return image
}

/// The island mark: the flame alone. The full hearth (two tellers around the
/// fire) is the richer story, but the island never gives the mark more than
/// 18pt — even expanded, the icon stays in the compact row — and the figures
/// turn to mush well before that. The favicon is wrong here for a different
/// reason: it paints an ink card that disappears into the island surface.
private func folkloreSparkImage() -> NSImage? {
    bundledImage(named: "folklore-spark.svg")
}

/// The full mark — flame plus the two tellers around it — recoloured for a dark
/// surface. Legible from ~20pt up; the expanded card gives it a 40pt tile.
private func folkloreMarkImage() -> NSImage? {
    bundledImage(named: "folklore-mark.svg") ?? folkloreSparkImage()
}

// MARK: - Activity feed

struct ActivityEvent: Decodable {
    let v: Int?
    let ts: String
    let direction: String
    let peer: String
    let kind: String
    let count: Int
    let nodes: [String]?
    let payload_tokens_estimate: Int?
}

final class ActivityFeedWatcher {
    private let path: String
    private let queue = DispatchQueue(label: "dev.folklore.activity-feed", qos: .utility)
    private let onEvent: (ActivityEvent) -> Void
    private var timer: DispatchSourceTimer?
    private var offset: UInt64 = 0
    private var carry = Data()

    init(home: String, onEvent: @escaping (ActivityEvent) -> Void) {
        path = (home as NSString).appendingPathComponent("activity-feed.jsonl")
        self.onEvent = onEvent
    }

    func start() {
        queue.async { [weak self] in
            guard let self else { return }
            self.offset = self.fileSize()
            let timer = DispatchSource.makeTimerSource(queue: self.queue)
            timer.schedule(deadline: .now() + .milliseconds(250), repeating: .milliseconds(400))
            timer.setEventHandler { [weak self] in self?.poll() }
            self.timer = timer
            timer.resume()
        }
    }

    func stop() {
        queue.async { [weak self] in
            self?.timer?.cancel()
            self?.timer = nil
        }
    }

    private func fileSize() -> UInt64 {
        guard let attrs = try? FileManager.default.attributesOfItem(atPath: path),
              let value = attrs[.size] as? NSNumber
        else { return 0 }
        return value.uint64Value
    }

    private func poll() {
        let size = fileSize()
        if size < offset {
            offset = 0
            carry.removeAll(keepingCapacity: true)
        }
        guard size > offset,
              let handle = try? FileHandle(forReadingFrom: URL(fileURLWithPath: path))
        else { return }

        do {
            try handle.seek(toOffset: offset)
            let chunk = try handle.readToEnd() ?? Data()
            try handle.close()
            offset += UInt64(chunk.count)
            carry.append(chunk)
            consumeCompleteLines()
        } catch {
            try? handle.close()
        }
    }

    private func consumeCompleteLines() {
        while let newline = carry.firstIndex(of: 0x0A) {
            let line = Data(carry[..<newline])
            carry.removeSubrange(carry.startIndex...newline)
            guard !line.isEmpty,
                  let event = try? JSONDecoder().decode(ActivityEvent.self, from: line),
                  event.v == nil || event.v == 1,
                  event.direction == "pull" || event.direction == "serve"
            else { continue }
            DispatchQueue.main.async { [onEvent] in onEvent(event) }
        }
    }
}

// MARK: - Island presentation

private extension NSColor {
    convenience init(hex: Int, alpha: CGFloat = 1) {
        self.init(
            calibratedRed: CGFloat((hex >> 16) & 0xff) / 255,
            green: CGFloat((hex >> 8) & 0xff) / 255,
            blue: CGFloat(hex & 0xff) / 255,
            alpha: alpha
        )
    }
}

/// Mirrors the `:root` block in site/assets/site.css. The island reads as
/// folklore only if it is the same warm palette the site is — every value here
/// has a counterpart in the stylesheet, and none of them are neutral grey.
private enum Brand {
    static let paper = NSColor(hex: 0xf4ecd8)
    static let ink = NSColor(hex: 0x1d1813)
    static let pink = NSColor(hex: 0xff4f6d)
    static let yellow = NSColor(hex: 0xf5b921)
    static let teal = NSColor(hex: 0x1fae8b)

    /// Near-black, to merge with the physical notch and the bezel — this is what
    /// makes the panel read as the notch growing a chin rather than a coloured
    /// card stuck beside it. boring.notch fills pure `.black` for exactly this;
    /// the brand lives in the accents and the logo, not the surface. A warm
    /// charcoal here (the old #171310) was the single reason it looked fake.
    static let surface = NSColor(hex: 0x050505)
    /// A hair warmer, for the expanded body only — far enough below the notch
    /// line that it can carry a whisper of brand without breaking the merge.
    static let surfaceBody = NSColor(hex: 0x0e0b09)
    /// `.term-tb .ttl` — muted paper for secondary text.
    static let paperMuted = NSColor(hex: 0xc9bda1)
    /// `.cmd .pd` — the dimmest legible step.
    static let paperDim = NSColor(hex: 0x8a7c62)

    static func hairline(_ alpha: CGFloat) -> NSColor { paper.withAlphaComponent(alpha) }
}

private func makeLabel(font: NSFont, color: NSColor, alignment: NSTextAlignment = .left) -> NSTextField {
    let label = NSTextField(labelWithString: "")
    label.font = font
    label.textColor = color
    label.alignment = alignment
    label.maximumNumberOfLines = 1
    label.lineBreakMode = .byTruncatingTail
    label.isSelectable = false
    label.isEditable = false
    label.drawsBackground = false
    label.wantsLayer = true
    return label
}

private func peerLabel(_ peer: String) -> String {
    let path = (folkloreHome as NSString).appendingPathComponent("peer-labels.json")
    if let data = FileManager.default.contents(atPath: path),
       let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
       let peers = json["peers"] as? [String: Any],
       let entry = peers[peer] as? [String: Any],
       let github = entry["github"] as? String,
       !github.isEmpty {
        return "@\(github)"
    }
    if peer.count <= 14 { return peer }
    // No published identity. A truncated hash ("peer:12D3Ko...0000") is the
    // ugliest thing on the card, so give an unlabeled peer a short, stable,
    // pronounceable-ish tag derived from its id instead — deterministic, so the
    // same peer always reads the same.
    var hash: UInt64 = 1469598103934665603              // FNV-1a
    for byte in peer.utf8 { hash = (hash ^ UInt64(byte)) &* 1099511628211 }
    let alphabet = Array("abcdefghijklmnopqrstuvwxyz0123456789")
    var tag = ""
    var value = hash
    for _ in 0..<4 { tag.append(alphabet[Int(value % 36)]); value /= 36 }
    return "peer-\(tag)"
}

private func readableNode(_ id: String?) -> String {
    guard let id, !id.isEmpty else { return "Reusable trace" }
    let parts = id.split(separator: "/", omittingEmptySubsequences: true)
    let tail = parts.last.map(String.init) ?? id
    let decoded = tail.removingPercentEncoding ?? tail
    let words = decoded
        .replacingOccurrences(of: "[-_]+", with: " ", options: .regularExpression)
        .trimmingCharacters(in: .whitespacesAndNewlines)
    let readable = words.isEmpty
        ? "Reusable trace"
        : words.prefix(1).uppercased() + words.dropFirst()
    if readable.count <= 42 { return readable }
    return "\(readable.prefix(38))..."
}

private struct IslandGeometry {
    let screen: NSScreen
    let hasNotch: Bool
    let sensorWidth: CGFloat
    let compactSize: NSSize
    let expandedSize: NSSize
    let topMargin: CGFloat

    init(screen: NSScreen) {
        self.screen = screen
        hasNotch = screen.safeAreaInsets.top > 0

        if hasNotch,
           let leftWidth = screen.auxiliaryTopLeftArea?.width,
           let rightWidth = screen.auxiliaryTopRightArea?.width {
            sensorWidth = min(max(screen.frame.width - leftWidth - rightWidth + 4, 142), 238)
        } else {
            sensorWidth = 0
        }

        let compactHeight = hasNotch ? min(max(screen.safeAreaInsets.top, 30), 40) : 32
        let compactWidth = hasNotch ? sensorWidth + 164 : 184
        let expandedWidth = min(max(404, sensorWidth + 176), screen.frame.width - 48)
        let expandedHeight = compactHeight + 88

        compactSize = NSSize(width: compactWidth, height: compactHeight)
        expandedSize = NSSize(width: expandedWidth, height: expandedHeight)
        topMargin = hasNotch ? 0 : 7
    }

    /// Slack around the island so a spring that overshoots its target still has
    /// opaque panel to land on. DynamicNotchKit pads by 50 for the same reason —
    /// the fix for a bouncing edge tearing is a bigger backdrop, not less bounce.
    static let padding: CGFloat = 26

    /// The panel is built at this size **once** and never resized. Animating an
    /// NSWindow's frame hands every tick to the window server, which recomposites
    /// the whole surface; boring.notch, NotchDrop, DynamicNotchKit and MioIsland
    /// all size one window to the open state up front and animate only content.
    var panelSize: NSSize {
        NSSize(
            width: min(expandedSize.width + Self.padding * 2, screen.frame.width),
            height: expandedSize.height + Self.padding
        )
    }

    var panelFrame: NSRect {
        NSRect(
            x: screen.frame.midX - panelSize.width / 2,
            y: screen.frame.maxY - panelSize.height - topMargin,
            width: panelSize.width,
            height: panelSize.height
        )
    }

    /// Island rect for a given size, in the fixed panel's flipped coordinates.
    func islandRect(for size: NSSize) -> NSRect {
        NSRect(
            x: (panelSize.width - size.width) / 2,
            y: 0,
            width: size.width,
            height: size.height
        )
    }
}

private enum IslandEventStyle {
    case pull
    case serve
    case search

    /// One accent per direction, all three straight from the site palette:
    /// teal for what the network gives you, pink for what you give back,
    /// yellow for what you already had.
    var accent: NSColor {
        switch self {
        case .pull: return Brand.teal
        case .serve: return Brand.pink
        case .search: return Brand.yellow
        }
    }

    /// Sentence case, not shouting caps — the wing label reads like a macOS
    /// Live Activity status, not a terminal log line.
    var wingVerb: String {
        switch self {
        case .pull: return "Received"
        case .serve: return "Shared"
        case .search: return "Matched"
        }
    }

    /// Plain-English context for the peer line — the raw hash never appears.
    func context(count: Int, tokens: Int) -> String {
        let nodes = "\(count) node\(count == 1 ? "" : "s")"
        switch self {
        case .pull: return "sent you \(nodes)"
        case .serve: return "pulled from your graph"
        case .search: return "matched \(nodes) locally"
        }
    }

    /// The trailing wing metric — the one hero number per event.
    func wingMetric(count: Int, tokens: Int) -> String {
        switch self {
        case .pull: return tokens > 0 ? "+\(tokens) tok" : "+\(count) node\(count == 1 ? "" : "s")"
        case .serve: return "rep +1"
        case .search: return "\(count) hit\(count == 1 ? "" : "s")"
        }
    }
}

private func style(for event: ActivityEvent) -> IslandEventStyle {
    if event.direction == "pull" { return .pull }
    if event.kind == "fetch" { return .serve }
    return .search
}

private extension NSBezierPath {
    /// `NSBezierPath.cgPath` is macOS 14+; this app targets 13. Same conversion,
    /// spelled the way the 13 SDK spells the element cases.
    var toCGPath: CGPath {
        let path = CGMutablePath()
        var points = [NSPoint](repeating: .zero, count: 3)
        for index in 0..<elementCount {
            switch element(at: index, associatedPoints: &points) {
            case .moveTo:    path.move(to: points[0])
            case .lineTo:    path.addLine(to: points[0])
            case .curveTo:   path.addCurve(to: points[2], control1: points[0], control2: points[1])
            case .closePath: path.closeSubpath()
            @unknown default: break
            }
        }
        return path
    }
}

/// The island outline. Radii interpolate with `expansion` so the corners round
/// out as it opens rather than snapping — the same trick `NotchShape` in
/// DynamicNotchKit / boring.notch pulls with `animatableData`.
private func islandPath(in rect: NSRect, expansion t: CGFloat, hasNotch: Bool) -> NSBezierPath {
    if !hasNotch {
        let closed = min(rect.height / 2, 17)
        let radius = closed + (22 - closed) * t
        return NSBezierPath(roundedRect: rect.insetBy(dx: 0.5, dy: 0.5), xRadius: radius, yRadius: radius)
    }

    let topInset: CGFloat = 5 + 2 * t
    let bottomRadius: CGFloat = 14 + 8 * t
    let minX = rect.minX + 0.5
    let maxX = rect.maxX - 0.5
    let minY = rect.minY
    let maxY = rect.maxY - 0.5
    let path = NSBezierPath()

    path.move(to: NSPoint(x: minX, y: minY))
    path.curve(
        to: NSPoint(x: minX + topInset, y: minY + topInset),
        controlPoint1: NSPoint(x: minX + topInset * 0.58, y: minY),
        controlPoint2: NSPoint(x: minX + topInset, y: minY + topInset * 0.45)
    )
    path.line(to: NSPoint(x: minX + topInset, y: maxY - bottomRadius))
    path.curve(
        to: NSPoint(x: minX + topInset + bottomRadius, y: maxY),
        controlPoint1: NSPoint(x: minX + topInset, y: maxY - bottomRadius * 0.42),
        controlPoint2: NSPoint(x: minX + topInset + bottomRadius * 0.42, y: maxY)
    )
    path.line(to: NSPoint(x: maxX - topInset - bottomRadius, y: maxY))
    path.curve(
        to: NSPoint(x: maxX - topInset, y: maxY - bottomRadius),
        controlPoint1: NSPoint(x: maxX - topInset - bottomRadius * 0.42, y: maxY),
        controlPoint2: NSPoint(x: maxX - topInset, y: maxY - bottomRadius * 0.42)
    )
    path.line(to: NSPoint(x: maxX - topInset, y: minY + topInset))
    path.curve(
        to: NSPoint(x: maxX, y: minY),
        controlPoint1: NSPoint(x: maxX - topInset, y: minY + topInset * 0.45),
        controlPoint2: NSPoint(x: maxX - topInset * 0.58, y: minY)
    )
    path.close()
    return path
}

/// The island's surface, composited entirely on the GPU.
///
/// This started as a custom animatable `expansion` property redrawn per frame.
/// That works — but the drawing was a bezier rebuild plus two radial NSGradient
/// washes rasterised over ~808×252 retina pixels every frame, and it only
/// sustained ~32fps: measured draws jumped 0.26 → 0.94 with nothing between.
/// Moving the morph off the window server only to stall the CPU is no fix, so
/// the shape is a CAShapeLayer and the washes are CAGradientLayers. Core
/// Animation interpolates `path` and the wash frames on the render server; the
/// CPU does nothing per frame.
final class IslandBackdrop: CALayer {
    private let shape = CAShapeLayer()

    var compactRect: NSRect = .zero
    var expandedRect: NSRect = .zero
    var hasNotch = false
    private(set) var expansion: CGFloat = 0

    override init() {
        super.init()
        // Near-black, no washes. A coloured wash would tint the surface and break
        // the merge with the physical notch — the whole point is that this reads
        // as an extension of the notch, not a card. On a notched screen the top
        // edge sits at y=0 and the physical camera cutout provides the "notch";
        // this black chin hangs off it. No border on the notched shape (a hairline
        // would draw a visible seam where the chin meets the bezel); non-notch
        // gets a faint edge so the free-floating pill reads against the wallpaper.
        shape.fillColor = Brand.surface.cgColor
        shape.lineWidth = 1
        addSublayer(shape)
    }

    override init(layer: Any) { super.init(layer: layer) }
    required init?(coder: NSCoder) { nil }

    func islandRect(at t: CGFloat) -> NSRect {
        let t = max(0, min(1, t))
        return NSRect(
            x: compactRect.minX + (expandedRect.minX - compactRect.minX) * t,
            y: compactRect.minY + (expandedRect.minY - compactRect.minY) * t,
            width: compactRect.width + (expandedRect.width - compactRect.width) * t,
            height: compactRect.height + (expandedRect.height - compactRect.height) * t
        )
    }

    /// Point the backdrop at `t`. With `spring`, the shape path springs; without,
    /// it snaps (used on configure / reduce-motion).
    func apply(expansion t: CGFloat, spring: CASpringAnimation?) {
        expansion = t
        let rect = islandRect(at: t)
        let path = islandPath(in: rect, expansion: t, hasNotch: hasNotch).toCGPath
        shape.strokeColor = hasNotch ? NSColor.clear.cgColor : Brand.hairline(0.10).cgColor

        guard let spring else {
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            shape.path = path
            CATransaction.commit()
            return
        }
        animate(shape, "path", to: path, spring)
    }

    private func animate(_ layer: CALayer, _ keyPath: String, to value: Any, _ spring: CASpringAnimation) {
        let animation = spring.copy() as! CASpringAnimation
        animation.keyPath = keyPath
        animation.fromValue = layer.presentation()?.value(forKeyPath: keyPath) ?? layer.value(forKeyPath: keyPath)
        animation.toValue = value
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        layer.setValue(value, forKeyPath: keyPath)
        CATransaction.commit()
        layer.add(animation, forKey: "folklore.\(keyPath)")
    }
}

final class IslandContentView: NSView {
    var onPress: (() -> Void)?

    // System sans (SF Pro) for all text, monospaced only for aligned digits.
    // Monospace-on-prose was what read as amateur; this matches macOS Live
    // Activities. SF Pro is the native system font, so nothing to bundle.
    private let brandIcon = NSImageView()          // wing flame — compact identity
    private let compactVerb = makeLabel(
        font: .systemFont(ofSize: 11, weight: .semibold),
        color: Brand.paper
    )
    private let compactMetric = makeLabel(
        font: .monospacedDigitSystemFont(ofSize: 11.5, weight: .semibold),
        color: Brand.paperMuted,
        alignment: .right
    )
    private let statusDot = NSView()               // live pulse dot
    /// The folklore logo, app-icon style — the recognizable mark at the front of
    /// the expanded card. `logoMark` is the image; `logoTile` is its container.
    private let logoTile = NSView()
    private let logoMark = NSImageView()
    /// The node title — the headline. System semibold, not a serif; at this size
    /// on this surface a clean sans reads as native, a serif reads as dated.
    private let title = makeLabel(
        font: .systemFont(ofSize: 15.5, weight: .semibold),
        color: Brand.paper
    )
    /// One line: "@peer-lab · sent you 2 nodes" — the peer, humanized, no hash.
    private let peerLine = makeLabel(
        font: .systemFont(ofSize: 12.5, weight: .regular),
        color: Brand.paperDim
    )

    private var expandedViews: [NSView] = []
    private var expanded = false
    private var hasNotch = false
    private var sensorWidth: CGFloat = 0
    private var compactHeight: CGFloat = 32
    private var currentAccent = Brand.teal

    private let backdrop = IslandBackdrop()
    private var compactSize = NSSize(width: 184, height: 32)
    private var expandedSize = NSSize(width: 404, height: 120)

    /// The island's own rect inside the fixed panel. Everything lays out against
    /// this, not against `bounds` — the view now spans the whole panel.
    private var islandRect: NSRect {
        let size = expanded ? expandedSize : compactSize
        return NSRect(x: ((bounds.width - size.width) / 2).rounded(), y: 0,
                      width: size.width, height: size.height)
    }

    override var isFlipped: Bool { true }
    override var acceptsFirstResponder: Bool { true }

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        layer?.backgroundColor = NSColor.clear.cgColor
        backdrop.frame = bounds
        backdrop.hasNotch = hasNotch
        layer?.addSublayer(backdrop)

        brandIcon.image = folkloreSparkImage()
        brandIcon.imageScaling = .scaleProportionallyUpOrDown
        brandIcon.setAccessibilityLabel("Folklore")

        statusDot.wantsLayer = true
        statusDot.layer?.cornerRadius = 3

        // The logo tile: a rounded, accent-tinted container holding the full mark.
        logoTile.wantsLayer = true
        logoTile.layer?.cornerRadius = 12
        logoTile.layer?.borderWidth = 1
        logoMark.image = folkloreMarkImage()
        logoMark.imageScaling = .scaleProportionallyUpOrDown
        logoMark.setAccessibilityLabel("Folklore")
        logoTile.addSubview(logoMark)

        expandedViews = [logoTile, title, peerLine]
        for view in [brandIcon, compactVerb, compactMetric, statusDot] + expandedViews {
            addSubview(view)
        }
        for view in expandedViews {
            view.alphaValue = 0
            view.isHidden = true
        }

        toolTip = "Folklore peer activity"
        showIdle(Snapshot())
    }

    required init?(coder: NSCoder) { nil }

    // No NSTrackingArea. It used to live on this view with `.inVisibleRect`,
    // whose bounds tracked the animating panel — so the morph itself fired
    // enter/exit events and re-triggered the morph. The controller now decides
    // hover geometrically from a mouse monitor, which cannot feed back.
    override func mouseDown(with event: NSEvent) {
        guard islandRect.contains(convert(event.locationInWindow, from: nil)) else { return }
        onPress?()
    }

    /// Clicks outside the island fall through to whatever is behind the panel.
    override func hitTest(_ point: NSPoint) -> NSView? {
        let local = convert(point, from: superview)
        return islandRect.contains(local) ? super.hitTest(point) : nil
    }

    fileprivate func configure(with geometry: IslandGeometry) {
        hasNotch = geometry.hasNotch
        sensorWidth = geometry.sensorWidth
        compactHeight = geometry.compactSize.height
        compactSize = geometry.compactSize
        expandedSize = geometry.expandedSize
        backdrop.hasNotch = geometry.hasNotch
        backdrop.frame = bounds
        backdrop.compactRect = geometry.islandRect(for: geometry.compactSize)
        backdrop.expandedRect = geometry.islandRect(for: geometry.expandedSize)
        backdrop.apply(expansion: expanded ? 1 : 0, spring: nil)
        needsLayout = true
    }

    /// The island's rect in screen coordinates — the controller's hit test.
    func islandScreenRect() -> NSRect? {
        guard let window else { return nil }
        return window.convertToScreen(convert(islandRect, to: nil))
    }

    /// Frame for a single-line label sitting on the vertical centre of a row.
    private func centred(_ label: NSTextField, x: CGFloat, width: CGFloat, in rowHeight: CGFloat) -> NSRect {
        let height = ceil(label.intrinsicContentSize.height)
        return NSRect(x: x, y: floor((rowHeight - height) / 2), width: width, height: height)
    }

    override func layout() {
        super.layout()
        backdrop.frame = bounds

        // Everything hangs off the island rect inside the fixed panel, so the
        // panel can stay put while the island grows.
        let island = islandRect
        let wingWidth = hasNotch ? max((island.width - sensorWidth) / 2, 64) : island.width / 2
        let leftInset: CGFloat = hasNotch ? 10 : 11
        let rightInset: CGFloat = hasNotch ? 10 : 11
        let iconSize: CGFloat = 18
        let iconY = floor((compactHeight - iconSize) / 2)

        brandIcon.frame = NSRect(x: island.minX + leftInset, y: iconY, width: iconSize, height: iconSize)
        startFlameSway()

        // A label handed a frame as tall as the row draws its single line at the
        // top of that frame, not down the middle of it — so the caps ride high
        // against the centred spark and dot. Give each label its own line height
        // and centre that instead.
        compactVerb.frame = centred(
            compactVerb,
            x: brandIcon.frame.maxX + 6,
            width: max(wingWidth - (brandIcon.frame.maxX - island.minX) - 8, 34),
            in: compactHeight
        )
        statusDot.frame = NSRect(
            x: island.maxX - rightInset - 6,
            y: floor((compactHeight - 6) / 2),
            width: 6,
            height: 6
        )
        compactMetric.frame = centred(
            compactMetric,
            x: island.maxX - wingWidth + 6,
            width: max(wingWidth - rightInset - 18, 48),
            in: compactHeight
        )

        // Body below the notch: logo tile on the left, title + peer line stacked
        // to its right — the macOS-notification "app icon + text" shape.
        let bodyTop = compactHeight
        let bodyHeight = island.maxY - bodyTop
        let tileSize: CGFloat = 40
        logoTile.frame = NSRect(
            x: island.minX + 18,
            y: bodyTop + floor((bodyHeight - tileSize) / 2),
            width: tileSize, height: tileSize
        )
        let markSize: CGFloat = 28
        logoMark.frame = NSRect(
            x: (tileSize - markSize) / 2, y: (tileSize - markSize) / 2,
            width: markSize, height: markSize
        )

        let textX = logoTile.frame.maxX + 13
        let textWidth = island.maxX - 18 - textX
        let titleH = ceil(title.intrinsicContentSize.height)
        let peerH = ceil(peerLine.intrinsicContentSize.height)
        let stackH = titleH + 3 + peerH
        let stackTop = bodyTop + floor((bodyHeight - stackH) / 2)
        title.frame = NSRect(x: textX, y: stackTop, width: textWidth, height: titleH)
        peerLine.frame = NSRect(x: textX, y: stackTop + titleH + 3, width: textWidth, height: peerH)
    }

    /// Background is the backdrop layer's job now — this view only hosts labels.

    /// Paints the live dot and (when present) starts its breathing pulse.
    private func setLiveDot(_ color: NSColor, pulsing: Bool) {
        statusDot.layer?.backgroundColor = color.cgColor
        statusDot.layer?.removeAnimation(forKey: "folklore.live-pulse")
        guard pulsing, !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion else { return }
        let pulse = CABasicAnimation(keyPath: "transform.scale")
        pulse.fromValue = 1.0
        pulse.toValue = 1.5
        pulse.duration = 0.95
        pulse.autoreverses = true
        pulse.repeatCount = .infinity
        pulse.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        statusDot.layer?.add(pulse, forKey: "folklore.live-pulse")
    }

    /// Tints the logo tile to the event accent — a wash of the accent over the
    /// dark surface, with a matching hairline border.
    private func tintLogoTile(_ accent: NSColor) {
        let bg = Brand.surface.blended(withFraction: 0.12, of: accent) ?? Brand.surface
        logoTile.layer?.backgroundColor = bg.cgColor
        logoTile.layer?.borderColor = accent.withAlphaComponent(0.28).cgColor
    }

    func showIdle(_ snapshot: Snapshot) {
        brandIcon.image = folkloreSparkImage()
        brandIcon.alphaValue = snapshot.daemon == "on" ? 1 : 0.5

        if snapshot.daemon == "on" {
            compactVerb.textColor = Brand.paper
            compactVerb.stringValue = "Online"
            compactMetric.stringValue = "\(snapshot.peers_connected) peer\(snapshot.peers_connected == 1 ? "" : "s")"
            setLiveDot(Brand.teal, pulsing: true)
        } else if snapshot.daemon == "stale" {
            compactVerb.textColor = Brand.yellow
            compactVerb.stringValue = "Stale"
            compactMetric.stringValue = "\(snapshot.peers_connected) peers"
            setLiveDot(Brand.yellow, pulsing: false)
        } else {
            // Offline still reads as folklore — a banked fire, not a dead pixel.
            compactVerb.textColor = Brand.paperDim
            compactVerb.stringValue = "Offline"
            compactMetric.stringValue = "0 peers"
            setLiveDot(Brand.paperDim.withAlphaComponent(0.55), pulsing: false)
        }
        setExpanded(false, animated: true)
    }

    func showCompact(_ event: ActivityEvent) {
        apply(event)
        setExpanded(false, animated: true)
        pulseCompact()
    }

    func showExpanded(_ event: ActivityEvent) {
        apply(event)
        setExpanded(true, animated: true)
    }

    private func apply(_ event: ActivityEvent) {
        let eventStyle = style(for: event)
        let accent = eventStyle.accent
        let who = peerLabel(event.peer)
        let node = readableNode(event.nodes?.first)
        let tokens = event.payload_tokens_estimate ?? 0

        currentAccent = accent
        brandIcon.alphaValue = 1

        // Wing: sentence-case status + one hero metric + a live dot.
        compactVerb.textColor = accent
        compactVerb.stringValue = eventStyle.wingVerb
        compactMetric.stringValue = eventStyle.wingMetric(count: event.count, tokens: tokens)
        setLiveDot(accent, pulsing: true)

        // Body: the logo, the node title, and one humanized peer line.
        tintLogoTile(accent)
        title.stringValue = node
        peerLine.attributedStringValue = peerLineText(
            who: who,
            context: eventStyle.context(count: event.count, tokens: tokens)
        )
    }

    /// "@peer-lab · sent you 2 nodes" — handle in paper, the rest dim.
    private func peerLineText(who: String, context: String) -> NSAttributedString {
        let font = NSFont.systemFont(ofSize: 12.5, weight: .regular)
        let line = NSMutableAttributedString(
            string: who,
            attributes: [.font: NSFont.systemFont(ofSize: 12.5, weight: .semibold), .foregroundColor: Brand.paper]
        )
        line.append(NSAttributedString(
            string: "  ·  \(context)",
            attributes: [.font: font, .foregroundColor: Brand.paperDim]
        ))
        return line
    }

    /// Springs used for the morph. Opening keeps a little bounce; closing is
    /// critically damped, because an island that overshoots on the way *in*
    /// reads as a glitch rather than as physics — boring.notch closes at
    /// dampingFraction 1.0 for the same reason.
    private static func morphSpring(opening: Bool) -> CASpringAnimation {
        let spring = CASpringAnimation()
        spring.mass = 1
        spring.stiffness = 273                  // response ≈ 0.38s
        spring.damping = opening ? 26.5 : 33    // ζ ≈ 0.80 opening, 1.0 closing
        spring.duration = spring.settlingDuration
        return spring
    }

    private func setExpanded(_ shouldExpand: Bool, animated: Bool) {
        guard shouldExpand != expanded else { return }
        expanded = shouldExpand

        let reduceMotion = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion
        let animate = animated && !reduceMotion

        // Capture where every label sits now, relaying out to the new state, then
        // spring each one from its old position to its new one. Same spring as the
        // backdrop, so the text travels with the shape instead of snapping ahead
        // of it — which is what layout-on-model-change does by default.
        let movable: [NSView] = [brandIcon, compactVerb, compactMetric, statusDot] + expandedViews
        let before = movable.map { $0.layer?.position ?? .zero }

        if shouldExpand { expandedViews.forEach { $0.isHidden = false } }
        needsLayout = true
        layoutSubtreeIfNeeded()

        guard animate else {
            backdrop.apply(expansion: shouldExpand ? 1 : 0, spring: nil)
            expandedViews.forEach { $0.alphaValue = shouldExpand ? 1 : 0; $0.isHidden = !shouldExpand }
            return
        }

        for (view, old) in zip(movable, before) {
            guard let layer = view.layer, old != .zero, layer.position != old else { continue }
            let move = Self.morphSpring(opening: shouldExpand)
            move.keyPath = "position"
            move.fromValue = NSValue(point: old)
            move.toValue = NSValue(point: layer.position)
            layer.add(move, forKey: "folklore.morph-position")
        }

        // The shape and its washes, on the same spring as the labels. Every value
        // interpolates on the render server; no window frame is touched, and the
        // CPU draws nothing per frame.
        backdrop.apply(expansion: shouldExpand ? 1 : 0, spring: Self.morphSpring(opening: shouldExpand))

        NSAnimationContext.runAnimationGroup { context in
            context.duration = shouldExpand ? 0.2 : 0.12
            context.timingFunction = CAMediaTimingFunction(controlPoints: 0.2, 0.8, 0.2, 1)
            expandedViews.forEach { $0.animator().alphaValue = shouldExpand ? 1 : 0 }
        } completionHandler: { [weak self] in
            guard let self, !self.expanded else { return }
            self.expandedViews.forEach { $0.isHidden = true }
        }

    }

    /// The site's flame never holds still (`flsway` in site.css). A frozen flame
    /// on the island is the tell that it's a different product, so the mark
    /// keeps the same sway.
    ///
    /// The CSS pivots at the flame's base (`transform-origin:50% 96%`); this
    /// scales about the centre instead. Re-anchoring the layer fights AppKit's
    /// flipped geometry and visibly drops the icon off the cap-line, and at 18pt
    /// the two pivots put the flame tip less than a pixel apart.
    private func startFlameSway() {
        guard !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion,
              brandIcon.layer?.animation(forKey: "folklore.flame-sway") == nil
        else { return }

        let sway = CAKeyframeAnimation(keyPath: "transform")
        sway.values = [
            flameTransform(scaleY: 1, skew: 0),
            flameTransform(scaleY: 1.06, skew: -2),
            flameTransform(scaleY: 0.97, skew: 1.6),
            flameTransform(scaleY: 1.04, skew: -1),
            flameTransform(scaleY: 1, skew: 0),
        ]
        sway.keyTimes = [0, 0.24, 0.52, 0.76, 1]
        sway.duration = 2.3
        sway.timingFunction = CAMediaTimingFunction(name: .easeInEaseOut)
        sway.repeatCount = .infinity
        brandIcon.layer?.add(sway, forKey: "folklore.flame-sway")
    }

    private func flameTransform(scaleY: CGFloat, skew: CGFloat) -> CATransform3D {
        var transform = CATransform3DMakeScale(1, scaleY, 1)
        transform.m21 = tan(skew * .pi / 180)
        return transform
    }

    private func pulseCompact() {
        guard !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion else { return }
        for view in [brandIcon, compactVerb, compactMetric, statusDot] {
            view.wantsLayer = true
            let pulse = CASpringAnimation(keyPath: "transform.scale")
            pulse.fromValue = 0.88
            pulse.toValue = 1
            pulse.mass = 0.7
            pulse.stiffness = 280
            pulse.damping = 18
            pulse.initialVelocity = 0.5
            pulse.duration = pulse.settlingDuration
            view.layer?.add(pulse, forKey: "folklore.compact-pulse")
        }
    }

    private func springContent(fromScale: CGFloat) {
        guard let layer, !NSWorkspace.shared.accessibilityDisplayShouldReduceMotion else { return }
        let spring = CASpringAnimation(keyPath: "transform.scale")
        spring.fromValue = fromScale
        spring.toValue = 1
        spring.mass = 1
        spring.stiffness = 250
        spring.damping = 24
        spring.initialVelocity = 0.2
        spring.duration = spring.settlingDuration
        layer.add(spring, forKey: "folklore.island-spring")
    }
}

final class ActivityIslandController {
    private let panel: NSPanel
    private let content: IslandContentView
    private var watcher: ActivityFeedWatcher?
    private var snapshot = Snapshot()
    private var geometry: IslandGeometry
    private var pending: [ActivityEvent] = []
    private var currentEvent: ActivityEvent?
    private var active = false
    private var expanded = false
    private var hovering = false
    private var hoverIntent = false
    private var sequence = 0
    private var collapseWork: DispatchWorkItem?
    private var hoverWork: DispatchWorkItem?
    private var mouseMonitors: [Any] = []

    init() {
        let screen = NSScreen.main ?? NSScreen.screens.first ?? NSScreen()
        geometry = IslandGeometry(screen: screen)
        // Built once at the panel size and never resized. This is the whole fix
        // for the jank: an animated NSWindow frame is composited by the window
        // server every tick, and the old code animated origin *and* size together.
        content = IslandContentView(frame: NSRect(origin: .zero, size: geometry.panelSize))
        panel = NSPanel(
            contentRect: NSRect(origin: .zero, size: geometry.panelSize),
            styleMask: [.borderless, .nonactivatingPanel],
            backing: .buffered,
            defer: false
        )
        panel.contentView = content
        panel.isFloatingPanel = true
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.level = NSWindow.Level(rawValue: NSWindow.Level.statusBar.rawValue + 2)
        panel.collectionBehavior = [.canJoinAllSpaces, .stationary, .fullScreenAuxiliary, .ignoresCycle]
        panel.hidesOnDeactivate = false
        // The panel now spans the whole open area even while the island is a small
        // pill, so it would swallow menu-bar clicks around it. Stay transparent to
        // the mouse until there is actually something to click.
        panel.ignoresMouseEvents = true
        panel.acceptsMouseMovedEvents = false
        panel.isReleasedWhenClosed = false
        content.configure(with: geometry)
        panel.setFrame(geometry.panelFrame, display: true)
        panel.orderFrontRegardless()

        content.onPress = { [weak self] in self?.toggleLatestEvent() }

        startMouseMonitors()

        watcher = ActivityFeedWatcher(home: folkloreHome) { [weak self] event in
            self?.enqueue(event)
        }
        watcher?.start()
    }

    deinit {
        collapseWork?.cancel()
        hoverWork?.cancel()
        watcher?.stop()
        for monitor in mouseMonitors { NSEvent.removeMonitor(monitor) }
    }

    // MARK: - Hover

    /// Hover is decided from the mouse position against the island's own rect,
    /// never from an NSTrackingArea on the animating view — that arrangement let
    /// the morph generate its own enter/exit events and re-trigger itself.
    private func startMouseMonitors() {
        let global = NSEvent.addGlobalMonitorForEvents(matching: [.mouseMoved]) { [weak self] _ in
            self?.mouseMoved()
        }
        let local = NSEvent.addLocalMonitorForEvents(matching: [.mouseMoved]) { [weak self] event in
            self?.mouseMoved()
            return event
        }
        mouseMonitors = [global, local].compactMap { $0 }
    }

    private func mouseMoved() {
        guard let rect = content.islandScreenRect() else { return }
        let inside = rect.insetBy(dx: -2, dy: -2).contains(NSEvent.mouseLocation)
        guard inside != hoverIntent else { return }
        hoverIntent = inside

        // Hysteresis both ways. The old code had a 0.36s exit delay and *no*
        // enter delay, so a cursor merely crossing the notch fired a full expand.
        hoverWork?.cancel()
        let delay = inside ? 0.3 : 0.12
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.hoverIntent == inside else { return }
            self.handleHover(inside)
        }
        hoverWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }

    func update(_ snapshot: Snapshot) {
        self.snapshot = snapshot
        if !active && !expanded { content.showIdle(snapshot) }
    }

    func screenParametersChanged() {
        let screen = NSScreen.main ?? NSScreen.screens.first ?? geometry.screen
        geometry = IslandGeometry(screen: screen)
        content.configure(with: geometry)
        // Reposition only — the panel keeps its size for the life of the screen.
        content.frame = NSRect(origin: .zero, size: geometry.panelSize)
        panel.setFrame(geometry.panelFrame, display: true)
    }

    /// Exercise the live presentation without writing a synthetic network event.
    func preview() {
        enqueue(ActivityEvent(
            v: 1,
            ts: ISO8601DateFormatter().string(from: Date()),
            direction: "pull",
            peer: "12D3KooWH7xq4vPn8yQ2mR6bF3kLcZ9wT1aJ5eD",
            kind: "fetch",
            count: 2,
            nodes: ["resolved-query://peer-traces-compound-knowledge"],
            payload_tokens_estimate: 638
        ))
    }

    private func enqueue(_ event: ActivityEvent) {
        if active {
            pending.append(event)
            if pending.count > 8 { pending.removeFirst(pending.count - 8) }
            return
        }
        present(event)
    }

    private func present(_ event: ActivityEvent) {
        sequence += 1
        let eventSequence = sequence
        active = true
        currentEvent = event
        collapseWork?.cancel()
        content.showCompact(event)

        let delay = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion ? 0 : 0.28
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard let self, self.sequence == eventSequence else { return }
            self.expand(event)
        }
    }

    private func expand(_ event: ActivityEvent) {
        expanded = true
        setInteractive(true)
        content.showExpanded(event)
        scheduleCollapse(after: hovering ? 30 : 3.7)
    }

    /// Only accept the mouse while there is something to click; otherwise the
    /// panel sits over the menu bar eating clicks meant for it.
    private func setInteractive(_ interactive: Bool) {
        panel.ignoresMouseEvents = !interactive
    }

    private func scheduleCollapse(after delay: TimeInterval) {
        collapseWork?.cancel()
        let work = DispatchWorkItem { [weak self] in self?.collapse() }
        collapseWork = work
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: work)
    }

    private func collapse() {
        guard !hovering else {
            scheduleCollapse(after: 1)
            return
        }
        sequence += 1
        expanded = false
        setInteractive(false)
        if let currentEvent { content.showCompact(currentEvent) }

        let settleDelay = NSWorkspace.shared.accessibilityDisplayShouldReduceMotion ? 0 : 0.42
        DispatchQueue.main.asyncAfter(deadline: .now() + settleDelay) { [weak self] in
            guard let self, !self.expanded, !self.hovering else { return }
            self.active = false
            self.content.showIdle(self.snapshot)
            if !self.pending.isEmpty {
                let next = self.pending.removeFirst()
                self.present(next)
            }
        }
    }

    private func handleHover(_ inside: Bool) {
        guard inside != hovering else { return }
        hovering = inside
        collapseWork?.cancel()
        guard let currentEvent else { return }

        if inside {
            // Re-entering an already-open island must not restart the morph.
            guard !expanded else { return }
            sequence += 1
            active = true
            expand(currentEvent)
        } else if expanded {
            scheduleCollapse(after: 0.36)
        }
    }

    private func toggleLatestEvent() {
        guard let currentEvent else { return }
        collapseWork?.cancel()
        if expanded {
            hovering = false
            collapse()
        } else {
            sequence += 1
            active = true
            expand(currentEvent)
        }
    }

}
