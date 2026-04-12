import Photos
import SwiftUI
import UIKit
import WidgetKit

struct ContentView: View {
    var body: some View {
        PhotoHomeView()
    }
}

private enum ActionHighlight: Equatable {
    case none
    case save(Bool)
    case copy(Bool)
    case force(Bool)
}

private struct PhotoHomeView: View {
    @Environment(\.scenePhase) private var scenePhase

    @State private var hasPhotoWidget = false
    @State private var refreshInterval: PhotoRefreshInterval = .oneHour
    @State private var sharedWidgetImage: UIImage?
    @State private var showShareSheet = false
    @State private var showSettings = false
    /// Which control just succeeded (or failed); animates that label green / amber.
    @State private var feedback: ActionHighlight = .none

    private enum ActionPart {
        case save, copy, force
    }

    @State private var showIntro = true
    /// True while the in-app fetch + snapshot write is in progress.
    @State private var isForceRefreshing = false

    private static let photoWidgetKind = "DailyWidgetExtension"
    private static let refreshIntervalKey = "photo.refreshIntervalSeconds"

    private var snapshotLoaded: Bool { sharedWidgetImage != nil }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if showIntro {
                Text("something to glance at.")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(.white.opacity(0.7))
                    .transition(.opacity)
            } else {
                Group {
                    if hasPhotoWidget {
                        ZStack(alignment: .bottomTrailing) {
                            installedState

                            Button {
                                showSettings = true
                            } label: {
                                Image(systemName: "gearshape")
                                    .font(.system(size: 20, weight: .regular))
                                    .foregroundStyle(.white.opacity(0.5))
                                    .frame(width: 44, height: 44)
                                    .contentShape(Rectangle())
                            }
                            .accessibilityLabel("Settings")
                            .safeAreaPadding(.trailing, 4)
                            .safeAreaPadding(.bottom, 2)
                        }
                    } else {
                        VStack {
                            Spacer()
                            onboardingState
                            Spacer()
                        }
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(.horizontal, 28)
                .transition(.opacity)
            }
        }
        .onAppear {
            loadRefreshInterval()
            checkWidgetPresence()
            refreshSharedWidgetImage()

            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                withAnimation(.easeOut(duration: 0.6)) {
                    showIntro = false
                }
            }
        }
        .onChange(of: scenePhase) { _, phase in
            if phase == .active {
                refreshSharedWidgetImage()
            }
        }
        .task(id: hasPhotoWidget) {
            guard hasPhotoWidget else { return }
            var previous = SharedPhotoSnapshot.lastUpdated
            while !Task.isCancelled {
                let latest = SharedPhotoSnapshot.lastUpdated
                if latest != previous {
                    previous = latest
                    await MainActor.run {
                        refreshSharedWidgetImage()
                    }
                }
                try? await Task.sleep(nanoseconds: 1_500_000_000)
            }
        }
        .sheet(isPresented: $showShareSheet) {
            if let sharedWidgetImage {
                ActivityView(activityItems: [sharedWidgetImage])
            }
        }
        .sheet(isPresented: $showSettings) {
            PhotoRefreshSettingsSheet(selection: $refreshInterval) { newValue in
                saveRefreshInterval(newValue)
                WidgetCenter.shared.reloadTimelines(ofKind: Self.photoWidgetKind)
            }
        }
    }

    private var onboardingState: some View {
        VStack(spacing: 28) {
            VStack(spacing: 10) {
                Text("just a glance.")
                    .font(.system(size: 16))
                    .foregroundStyle(.white.opacity(0.6))
            }

            VStack(alignment: .leading, spacing: 18) {
                onboardingStep("01", "press and hold your home screen")
                onboardingStep("02", "tap “Edit“")
                onboardingStep("03", "search “glance”")
                onboardingStep("04", "add the widget")
            }
        }
    }

    private var installedState: some View {
        GeometryReader { geo in
            let safeTop = geo.safeAreaInsets.top
            let safeBottom = geo.safeAreaInsets.bottom
            let imageSide = min(geo.size.width, geo.size.height * 0.5)
            let topBias = max(safeTop, geo.size.height * 0.11)
            let bottomBias = max(safeBottom + 56, geo.size.height * 0.2)

            VStack(spacing: 0) {
                Spacer(minLength: topBias)

                HStack(alignment: .center) {
                    Spacer(minLength: 0)
                    Group {
                        if let img = sharedWidgetImage {
                            Image(uiImage: img)
                                .resizable()
                                .scaledToFill()
                                .frame(width: imageSide, height: imageSide)
                                .clipped()
                                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                                .id(SharedPhotoSnapshot.lastUpdated?.timeIntervalSince1970 ?? 0)
                        } else {
                            ZStack {
                                RoundedRectangle(cornerRadius: 16, style: .continuous)
                                    .fill(Color.white.opacity(0.06))
                                Text("your current widget photo will show here after it refreshes.")
                                    .font(.system(size: 14))
                                    .foregroundStyle(.white.opacity(0.35))
                                    .multilineTextAlignment(.center)
                                    .padding(.horizontal, 20)
                            }
                            .frame(width: imageSide, height: imageSide)
                        }
                    }
                    .padding(.leading, geo.size.width * 0.06)
                    Spacer(minLength: 0)
                }

                HStack(spacing: 0) {
                    Spacer(minLength: 0)
                    Text("save")
                        .foregroundStyle(actionForeground(base: snapshotLoaded ? 0.52 : 0.22, part: .save))
                        .offset(y: actionBounce(part: .save))
                        .onTapGesture { saveSharedImageToPhotos() }
                    Text(" · ")
                        .foregroundStyle(.white.opacity(0.35))
                    Text("copy")
                        .foregroundStyle(actionForeground(base: snapshotLoaded ? 0.52 : 0.22, part: .copy))
                        .offset(y: actionBounce(part: .copy))
                        .onTapGesture { copySharedImage() }
                    Text(" · ")
                        .foregroundStyle(.white.opacity(0.35))
                    Text("share")
                        .foregroundStyle(.white.opacity(snapshotLoaded ? 0.52 : 0.22))
                        .onTapGesture {
                            guard snapshotLoaded else { return }
                            showShareSheet = true
                        }
                    Spacer(minLength: 0)
                }
                .font(.system(size: 16, weight: .regular))
                .animation(.spring(response: 0.42, dampingFraction: 0.72), value: feedback)
                .padding(.top, 16)

                HStack(spacing: 8) {
                    Text("force")
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 16, weight: .medium))
                        .symbolRenderingMode(.monochrome)
                        .symbolEffect(.rotate, options: .repeating, isActive: isForceRefreshing)
                }
                .font(.system(size: 16, weight: .regular))
                .foregroundStyle(actionForeground(base: 0.52, part: .force))
                .offset(y: actionBounce(part: .force))
                .animation(.spring(response: 0.42, dampingFraction: 0.72), value: feedback)
                .padding(.top, 18)
                .contentShape(Rectangle())
                .allowsHitTesting(!isForceRefreshing)
                .accessibilityAddTraits(isForceRefreshing ? [.updatesFrequently] : [])
                .onTapGesture { forceRefreshWidgetAndSnapshot() }

                Spacer(minLength: bottomBias)
            }
            .frame(width: geo.size.width, height: geo.size.height, alignment: .top)
        }
    }

    private func actionForeground(base: Double, part: ActionPart) -> Color {
        if part == .force, isForceRefreshing {
            return Color.white.opacity(0.38)
        }
        switch (feedback, part) {
        case (.save(let ok), .save):
            return ok ? Self.successGreen : Self.warnColor
        case (.copy(let ok), .copy):
            return ok ? Self.successGreen : Self.warnColor
        case (.force(let ok), .force):
            return ok ? Self.successGreen : Self.warnColor
        default:
            return Color.white.opacity(base)
        }
    }

    private func actionBounce(part: ActionPart) -> CGFloat {
        switch (feedback, part) {
        case (.save(true), .save), (.copy(true), .copy), (.force(true), .force):
            return -4
        case (.save(false), .save), (.copy(false), .copy), (.force(false), .force):
            return -1
        default:
            return 0
        }
    }

    private static let successGreen = Color(red: 0.42, green: 0.9, blue: 0.58)
    private static let warnColor = Color(red: 1.0, green: 0.58, blue: 0.38)

    private func onboardingStep(_ index: String, _ text: String) -> some View {
        HStack(spacing: 12) {
            Text(index)
                .font(.system(size: 12, design: .monospaced))
                .foregroundStyle(.white.opacity(0.4))

            Text(text)
                .font(.system(size: 17))
                .foregroundStyle(.white.opacity(0.9))
        }
    }

    private func checkWidgetPresence() {
        WidgetCenter.shared.getCurrentConfigurations { result in
            guard case let .success(configs) = result else { return }
            DispatchQueue.main.async {
                hasPhotoWidget = configs.contains { $0.kind == Self.photoWidgetKind }
            }
        }
    }

    private func loadRefreshInterval() {
        guard let defaults = UserDefaults(suiteName: SharedSunConfiguration.appGroupID) else { return }
        let stored = defaults.double(forKey: Self.refreshIntervalKey)
        refreshInterval = PhotoRefreshInterval(seconds: stored) ?? .oneHour
    }

    private func saveRefreshInterval(_ interval: PhotoRefreshInterval) {
        guard let defaults = UserDefaults(suiteName: SharedSunConfiguration.appGroupID) else { return }
        defaults.set(interval.seconds, forKey: Self.refreshIntervalKey)
    }

    private func pulseFeedback(_ highlight: ActionHighlight) {
        withAnimation(.spring(response: 0.4, dampingFraction: 0.72)) {
            feedback = highlight
        }
        DispatchQueue.main.asyncAfter(deadline: .now() + 1.45) {
            withAnimation(.easeOut(duration: 0.35)) {
                feedback = .none
            }
        }
    }

    /// Fetch once in-app, write app-group JPEG, then reload timelines so the widget reads that file (see `SharedPhotoSnapshot.markNextWidgetTimelineReloadUsesSharedSnapshotOnly`).
    private func forceRefreshWidgetAndSnapshot() {
        guard !isForceRefreshing else { return }
        isForceRefreshing = true
        UIImpactFeedbackGenerator(style: .light).impactOccurred()

        Task {
            let appSucceeded = await GlancePhotoRefresh.fetchAndWriteSharedSnapshot()
            await MainActor.run {
                refreshSharedWidgetImage()
                isForceRefreshing = false
                pulseFeedback(.force(appSucceeded))
            }
            WidgetCenter.shared.reloadTimelines(ofKind: Self.photoWidgetKind)
        }
    }

    private func refreshSharedWidgetImage() {
        sharedWidgetImage = SharedPhotoSnapshot.loadImage()
    }

    private func saveSharedImageToPhotos() {
        guard let image = sharedWidgetImage else {
            pulseFeedback(.save(false))
            return
        }
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            DispatchQueue.main.async {
                guard status == .authorized || status == .limited else {
                    pulseFeedback(.save(false))
                    return
                }
                PHPhotoLibrary.shared().performChanges {
                    PHAssetChangeRequest.creationRequestForAsset(from: image)
                } completionHandler: { ok, error in
                    DispatchQueue.main.async {
                        if ok {
                            pulseFeedback(.save(true))
                        } else if error != nil {
                            pulseFeedback(.save(false))
                        } else {
                            pulseFeedback(.save(false))
                        }
                    }
                }
            }
        }
    }

    private func copySharedImage() {
        guard let image = sharedWidgetImage else {
            pulseFeedback(.copy(false))
            return
        }
        UIPasteboard.general.image = image
        pulseFeedback(.copy(true))
    }
}

private struct PhotoRefreshSettingsSheet: View {
    @Binding var selection: PhotoRefreshInterval
    var onCommit: (PhotoRefreshInterval) -> Void
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                VStack(alignment: .center, spacing: 12) {
                    Text("new photos on your widget")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.center)

                    Text("The Glance photo on your home screen can change from time to time. This setting is how long it waits before it shows something new.")
                        .font(.system(size: 15, weight: .regular))
                        .foregroundStyle(.white.opacity(0.68))
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)

                    HStack {
                        Spacer(minLength: 0)
                        InfiniteIntervalWheel(selection: $selection)
                            .frame(width: InfiniteIntervalWheel.pickerWidth, height: InfiniteIntervalWheel.pickerHeight)
                            .clipped()
                            .onChange(of: selection) { _, newValue in
                                onCommit(newValue)
                            }
                        Spacer(minLength: 0)
                    }
                    .padding(.vertical, 6)

                    Text("Your iPhone refreshes widgets in the background, so the exact moment can vary a little.")
                        .font(.system(size: 15, weight: .regular))
                        .foregroundStyle(.white.opacity(0.55))
                        .multilineTextAlignment(.center)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.horizontal, 8)
                .padding(.top, 0)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .padding(.horizontal, 24)
            .background(Color.black)
        }
        .preferredColorScheme(.dark)
        .presentationDragIndicator(.visible)
    }
}

/// UIKit share sheet for `UIImage` (includes AirDrop, Messages, Save to Files, etc.).
private struct ActivityView: UIViewControllerRepresentable {
    let activityItems: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: activityItems, applicationActivities: nil)
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

/// Clock-style wheel: many repeated rows so scrolling feels endless; labels repeat via modulo.
private struct InfiniteIntervalWheel: UIViewRepresentable {
    @Binding var selection: PhotoRefreshInterval

    /// Row height (spacing between options). Clip height slightly under 5× row so a 6th row never peeks in.
    static let rowHeight: CGFloat = 38
    private static let visibleRowCount = 5
    static var pickerHeight: CGFloat { rowHeight * CGFloat(visibleRowCount) - 4 }
    static var pickerWidth: CGFloat { 150 }

    private static let items = PhotoRefreshInterval.allCases
    private static let rowCount = 10_000
    private static let anchorRow = rowCount / 2

    func makeCoordinator() -> Coordinator {
        Coordinator(selection: $selection)
    }

    func makeUIView(context: Context) -> UIPickerView {
        let picker = UIPickerView()
        picker.backgroundColor = .black
        picker.delegate = context.coordinator
        picker.dataSource = context.coordinator
        context.coordinator.attachScrollReloadIfPossible(to: picker)
        Self.scheduleStripSelectionChrome(on: picker)
        return picker
    }

    /// Hides the system wheel’s centered rounded “selection” plate (private subviews; safe to clear).
    private static func stripSelectionChrome(from picker: UIPickerView) {
        picker.layoutIfNeeded()
        func visit(_ view: UIView) {
            let name = NSStringFromClass(type(of: view))
            let looksLikeSelectionChrome =
                name.range(of: "Selection", options: .caseInsensitive) != nil
                || name.range(of: "Indicator", options: .caseInsensitive) != nil
            let skip =
                name.range(of: "Wheel", options: .caseInsensitive) != nil
                || name.range(of: "Table", options: .caseInsensitive) != nil
                || name.range(of: "Scroll", options: .caseInsensitive) != nil
                || name.range(of: "Cell", options: .caseInsensitive) != nil
            if looksLikeSelectionChrome, !skip {
                view.isHidden = true
                view.alpha = 0
            }
            view.subviews.forEach { visit($0) }
        }
        visit(picker)
    }

    private static func scheduleStripSelectionChrome(on picker: UIPickerView) {
        let run = {
            stripSelectionChrome(from: picker)
        }
        DispatchQueue.main.async(execute: run)
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12, execute: run)
    }

    func updateUIView(_ picker: UIPickerView, context: Context) {
        guard let idx = Self.items.firstIndex(of: selection) else { return }

        if !context.coordinator.didPlaceInitial {
            let row = Self.alignedRow(containing: Self.anchorRow, index: idx)
            picker.selectRow(row, inComponent: 0, animated: false)
            context.coordinator.visualCenterRow = row
            context.coordinator.didPlaceInitial = true
            Self.scheduleStripSelectionChrome(on: picker)
            return
        }

        let current = picker.selectedRow(inComponent: 0)
        if Self.items[current % Self.items.count] == selection { return }

        let target = Self.alignedRow(containing: current, index: idx)
        picker.selectRow(target, inComponent: 0, animated: false)
        Self.scheduleStripSelectionChrome(on: picker)
    }

    private static func alignedRow(containing base: Int, index: Int) -> Int {
        base - (base % items.count) + index
    }

    final class Coordinator: NSObject, UIPickerViewDelegate, UIPickerViewDataSource {
        var selection: Binding<PhotoRefreshInterval>
        var didPlaceInitial = false
        /// During scroll, `selectedRow(inComponent:)` can lag; use this for alpha (updated from scroll offset).
        var visualCenterRow: Int = 0
        private var scrollForwarder: PickerScrollDelegateForwarder?
        private var scrollAttachAttempts: Int = 0

        init(selection: Binding<PhotoRefreshInterval>) {
            self.selection = selection
        }

        /// `UIPickerView` doesn’t redraw row titles while scrolling; `selectedRow` can also lag until deceleration ends.
        /// We hook the embedded scroll view and reload + track approximate center row so the gradient tracks the wheel.
        fileprivate func attachScrollReloadIfPossible(to picker: UIPickerView) {
            guard scrollForwarder == nil else { return }
            scrollAttachAttempts += 1
            guard scrollAttachAttempts <= 10 else { return }
            DispatchQueue.main.async { [weak self, weak picker] in
                guard let self, let picker else { return }
                guard let scroll = Self.findInnerScrollView(from: picker) else {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) {
                        self.attachScrollReloadIfPossible(to: picker)
                    }
                    return
                }
                let forward = scroll.delegate
                let forwarder = PickerScrollDelegateForwarder(
                    picker: picker,
                    forward: forward,
                    onScroll: { [weak self] scrollView, pick in
                        self?.updateVisualCenterRow(from: scrollView, picker: pick)
                    }
                )
                self.scrollForwarder = forwarder
                scroll.delegate = forwarder
                self.visualCenterRow = picker.selectedRow(inComponent: 0)
            }
        }

        private static func findInnerScrollView(from root: UIView) -> UIScrollView? {
            for sub in root.subviews {
                if let s = sub as? UIScrollView { return s }
                if let nested = findInnerScrollView(from: sub) { return nested }
            }
            return nil
        }

        fileprivate func updateVisualCenterRow(from scrollView: UIScrollView, picker: UIPickerView) {
            let rowH = InfiniteIntervalWheel.rowHeight
            guard rowH > 0 else { return }
            let y = scrollView.contentOffset.y
            let h = scrollView.bounds.height
            let centerY = y + h * 0.5
            visualCenterRow = Int(round(centerY / rowH))
            picker.reloadComponent(0)
        }

        func numberOfComponents(in pickerView: UIPickerView) -> Int { 1 }

        func pickerView(_ pickerView: UIPickerView, numberOfRowsInComponent component: Int) -> Int {
            InfiniteIntervalWheel.rowCount
        }

        func pickerView(_ pickerView: UIPickerView, rowHeightForComponent component: Int) -> CGFloat {
            InfiniteIntervalWheel.rowHeight
        }

        func pickerView(_ pickerView: UIPickerView, attributedTitleForRow row: Int, forComponent component: Int) -> NSAttributedString? {
            let text = InfiniteIntervalWheel.items[row % InfiniteIntervalWheel.items.count].wheelLabel
            let selected = pickerView.selectedRow(inComponent: component)
            let anchorRow = scrollForwarder != nil ? visualCenterRow : selected
            let distance = abs(row - anchorRow)
            let alpha: CGFloat
            switch distance {
            case 0: alpha = 1.0
            case 1: alpha = 0.72
            case 2: alpha = 0.34
            default: alpha = 0.18
            }
            return NSAttributedString(
                string: text,
                attributes: [
                    .foregroundColor: UIColor.white.withAlphaComponent(alpha),
                    .font: UIFont.systemFont(ofSize: 18, weight: .regular),
                ]
            )
        }

        func pickerView(_ pickerView: UIPickerView, didSelectRow row: Int, inComponent component: Int) {
            visualCenterRow = row
            let interval = InfiniteIntervalWheel.items[row % InfiniteIntervalWheel.items.count]
            if selection.wrappedValue != interval {
                selection.wrappedValue = interval
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            }
        }
    }
}

/// Forwards the picker's internal `UIScrollView` delegate so rows reload while scrolling (alpha gradient tracks motion).
private final class PickerScrollDelegateForwarder: NSObject, UIScrollViewDelegate {
    weak var picker: UIPickerView?
    weak var forward: UIScrollViewDelegate?
    var onScroll: ((UIScrollView, UIPickerView) -> Void)?

    init(picker: UIPickerView, forward: UIScrollViewDelegate?, onScroll: @escaping (UIScrollView, UIPickerView) -> Void) {
        self.picker = picker
        self.forward = forward
        self.onScroll = onScroll
    }

    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        forward?.scrollViewDidScroll?(scrollView)
        guard let picker else { return }
        onScroll?(scrollView, picker)
    }

    override func responds(to aSelector: Selector!) -> Bool {
        if super.responds(to: aSelector) { return true }
        return forward?.responds(to: aSelector) ?? false
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        if aSelector == #selector(UIScrollViewDelegate.scrollViewDidScroll(_:)) {
            return nil
        }
        if forward?.responds(to: aSelector) == true {
            return forward
        }
        return super.forwardingTarget(for: aSelector)
    }
}

private enum PhotoRefreshInterval: String, CaseIterable, Identifiable {
    case thirtyMinutes
    case oneHour
    case twoHours
    case halfDay
    case daily

    var id: String { rawValue }

    var seconds: TimeInterval {
        switch self {
        case .thirtyMinutes: return 1800
        case .oneHour: return 3600
        case .twoHours: return 7200
        case .halfDay: return 43200
        case .daily: return 86400
        }
    }

    init?(seconds: TimeInterval) {
        switch Int(seconds) {
        case 1800: self = .thirtyMinutes
        case 3600: self = .oneHour
        case 7200: self = .twoHours
        case 43200: self = .halfDay
        case 86400: self = .daily
        default: return nil
        }
    }

    /// Short labels for the compact inline wheel only.
    var wheelLabel: String {
        switch self {
        case .thirtyMinutes: return "30m"
        case .oneHour: return "1h"
        case .twoHours: return "2h"
        case .halfDay: return "12h"
        case .daily: return "1d"
        }
    }
}

#Preview {
    ContentView()
}
