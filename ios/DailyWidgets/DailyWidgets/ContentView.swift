import SwiftUI
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

            VStack(spacing: 6) {
                Text("automatically updates")
                    .foregroundStyle(.white.opacity(0.6))

                HStack(spacing: 4) {
                    Text("every")

                    Text(refreshInterval.display)
                        .underline()
                        .onTapGesture {
                            withAnimation(.spring(response: 0.4, dampingFraction: 0.8)) {
                                showIntervalPicker.toggle()
                            }
                        }
                }
            }
            .font(.system(size: 22, weight: .regular))
            .foregroundStyle(.white)

            // Interval selector
            if showIntervalPicker {
                GlanceIntervalSelector(
                    selected: $refreshInterval,
                    onSelect: {
                        saveRefreshInterval(refreshInterval)
                        WidgetCenter.shared.reloadTimelines(ofKind: Self.photoWidgetKind)

                        withAnimation(.easeOut) {
                            showIntervalPicker = false
                        }
                    }
                )
                .frame(height: 160)
                .transition(.opacity)
            }

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

private struct GlanceIntervalSelector: View {
    @Binding var selected: PhotoRefreshInterval
    var onSelect: () -> Void

    @State private var scrollOffset: CGFloat = 0

    private let itemHeight: CGFloat = 36

    var body: some View {
        GeometryReader { outer in
            let centerY = outer.size.height / 2

            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 12) {
                    ForEach(PhotoRefreshInterval.allCases) { interval in
                        GeometryReader { geo in
                            let midY = geo.frame(in: .global).midY
                            let distance = abs(centerY - midY)

                            let normalized = min(distance / 120, 1)

                            let opacity = 1 - (normalized * 0.7)
                            let scale = 1 - (normalized * 0.15)

                            Text(interval.display)
                                .font(.system(size: 20))
                                .scaleEffect(scale)
                                .opacity(opacity)
                                .frame(maxWidth: .infinity)
                                .onTapGesture {
                                    select(interval)
                                }
                                .onChange(of: normalized) { _, newVal in
                                    // closest to center → select
                                    if newVal < 0.1 && selected != interval {
                                        select(interval)
                                    }
                                }
                        }
                        .frame(height: itemHeight)
                    }
                }
                .padding(.vertical, centerY - itemHeight / 2)
            }
        }
    }

    private func select(_ interval: PhotoRefreshInterval) {
        selected = interval

        UIImpactFeedbackGenerator(style: .light).impactOccurred()

        onSelect()
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
