import SwiftUI
import UIKit
import WidgetKit

struct ContentView: View {
    var body: some View {
        PhotoHomeView()
    }
}

private struct PhotoHomeView: View {
    @State private var didRefresh = false
    @State private var hasPhotoWidget = false
    @State private var refreshInterval: PhotoRefreshInterval = .oneHour

    @State private var showIntro = true
    @State private var showIntervalPicker = false

    private static let photoWidgetKind = "DailyWidgetExtension"
    private static let refreshIntervalKey = "photo.refreshIntervalSeconds"

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()

            if showIntro {
                Text("something to glance at.")
                    .font(.system(size: 18, weight: .regular))
                    .foregroundStyle(.white.opacity(0.7))
                    .transition(.opacity)
            } else {
                VStack {
                    Spacer()

                    if hasPhotoWidget {
                        installedState
                    } else {
                        onboardingState
                    }

                    Spacer()
                }
                .padding(.horizontal, 28)
                .transition(.opacity)
            }
        }
        .onAppear {
            loadRefreshInterval()
            checkWidgetPresence()

            DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) {
                withAnimation(.easeOut(duration: 0.6)) {
                    showIntro = false
                }
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
        VStack(spacing: 32) {

            // Sentence stays; only the underlined interval swaps for the wheel.
            HStack(alignment: .center, spacing: 6) {
                Text("automatically updates every")
                    .foregroundStyle(.white.opacity(0.6))
                    .lineLimit(1)
                    .onTapGesture {
                        if showIntervalPicker {
                            withAnimation(.easeInOut(duration: 0.28)) {
                                showIntervalPicker = false
                            }
                        }
                    }

                Group {
                    if showIntervalPicker {
                        InfiniteIntervalWheel(selection: $refreshInterval)
                            .frame(width: 130, height: 128)
                            .onChange(of: refreshInterval) { _, newValue in
                                saveRefreshInterval(newValue)
                                WidgetCenter.shared.reloadTimelines(ofKind: Self.photoWidgetKind)
                            }
                            .transition(.opacity)
                    } else {
                        Text(refreshInterval.display)
                            .underline()
                            .foregroundStyle(.white)
                            .lineLimit(1)
                            .onTapGesture {
                                withAnimation(.easeInOut(duration: 0.28)) {
                                    showIntervalPicker = true
                                }
                            }
                            .transition(.opacity)
                    }
                }
                .frame(width: 130, alignment: .center)
                .animation(.easeInOut(duration: 0.28), value: showIntervalPicker)
            }
            .font(.system(size: 22, weight: .regular))
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)

            // Refresh
            Text("another")
                .font(.system(size: 16))
                .foregroundStyle(.white.opacity(0.8))
                .onTapGesture {
                    WidgetCenter.shared.reloadTimelines(ofKind: Self.photoWidgetKind)
                    showTemporaryConfirmation()
                }

            if didRefresh {
                Text("updated.")
                    .font(.system(size: 13))
                    .foregroundStyle(.white.opacity(0.5))
                    .transition(.opacity)
            }
        }
    }

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

    private func showTemporaryConfirmation() {
        didRefresh = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 2.0) {
            withAnimation {
                didRefresh = false
            }
        }
    }
}

/// Clock-style wheel: many repeated rows so scrolling feels endless; labels repeat via modulo.
private struct InfiniteIntervalWheel: UIViewRepresentable {
    @Binding var selection: PhotoRefreshInterval

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
        return picker
    }

    func updateUIView(_ picker: UIPickerView, context: Context) {
        guard let idx = Self.items.firstIndex(of: selection) else { return }

        if !context.coordinator.didPlaceInitial {
            let row = Self.alignedRow(containing: Self.anchorRow, index: idx)
            picker.selectRow(row, inComponent: 0, animated: false)
            context.coordinator.didPlaceInitial = true
            return
        }

        let current = picker.selectedRow(inComponent: 0)
        if Self.items[current % Self.items.count] == selection { return }

        let target = Self.alignedRow(containing: current, index: idx)
        picker.selectRow(target, inComponent: 0, animated: false)
    }

    private static func alignedRow(containing base: Int, index: Int) -> Int {
        base - (base % items.count) + index
    }

    final class Coordinator: NSObject, UIPickerViewDelegate, UIPickerViewDataSource {
        var selection: Binding<PhotoRefreshInterval>
        var didPlaceInitial = false

        init(selection: Binding<PhotoRefreshInterval>) {
            self.selection = selection
        }

        func numberOfComponents(in pickerView: UIPickerView) -> Int { 1 }

        func pickerView(_ pickerView: UIPickerView, numberOfRowsInComponent component: Int) -> Int {
            InfiniteIntervalWheel.rowCount
        }

        func pickerView(_ pickerView: UIPickerView, attributedTitleForRow row: Int, forComponent component: Int) -> NSAttributedString? {
            let text = InfiniteIntervalWheel.items[row % InfiniteIntervalWheel.items.count].display
            return NSAttributedString(
                string: text,
                attributes: [
                    .foregroundColor: UIColor.white,
                    .font: UIFont.systemFont(ofSize: 22, weight: .regular),
                ]
            )
        }

        func pickerView(_ pickerView: UIPickerView, didSelectRow row: Int, inComponent component: Int) {
            let interval = InfiniteIntervalWheel.items[row % InfiniteIntervalWheel.items.count]
            if selection.wrappedValue != interval {
                selection.wrappedValue = interval
                UIImpactFeedbackGenerator(style: .light).impactOccurred()
            }
        }
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

    var display: String {
        switch self {
        case .thirtyMinutes: return "30 min"
        case .oneHour: return "1 hour"
        case .twoHours: return "2 hours"
        case .halfDay: return "12 hours"
        case .daily: return "1 day"
        }
    }
}

#Preview {
    ContentView()
}
