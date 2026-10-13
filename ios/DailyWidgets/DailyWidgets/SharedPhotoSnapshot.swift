import Darwin
import Foundation
import UIKit

/// Mirrors the widget’s current photo into the App Group so the main app can share, save, or copy it.
/// `appGroupID` must match the widget extension’s App Group entitlement.
enum SharedPhotoSnapshot {
    enum SnapshotVariant {
        case standard
        case medium

        var fileName: String {
            switch self {
            case .standard:
                return "glance-widget-current.jpg"
            case .medium:
                return "glance-widget-medium-current.jpg"
            }
        }

        var updatedAtKey: String {
            switch self {
            case .standard:
                return SharedPhotoSnapshot.updatedAtKey
            case .medium:
                return "photo.shared.medium.updatedAt"
            }
        }
    }

    struct RecentItem: Codable, Identifiable, Equatable {
        let id: String
        let fileName: String
        let caption: String?
        let updatedAt: TimeInterval

        var date: Date {
            Date(timeIntervalSince1970: updatedAt)
        }
    }

    static let appGroupID = "group.com.aryapatel.glance1234"

    private static let recentsDirectoryName = "recent-glances"
    private static let updatedAtKey = "photo.shared.updatedAt"
    private static let captionKey = "photo.shared.caption"
    private static let recentsKey = "photo.shared.recents"
    private static let maxRecentItems = 12
    /// Images and metadata are committed in one atomic file, shared by every widget family.
    struct Photo: Codable, Equatable {
        let data: Data
        let caption: String?
        let postId: UUID
    }

    struct Snapshot: Codable, Equatable {
        let standard: Photo
        let medium: Photo?
        let updatedAt: Date

        func photo(for variant: SnapshotVariant) -> Photo? {
            variant == .medium ? medium : standard
        }

        func isFresh(interval: TimeInterval, now: Date = Date()) -> Bool {
            let age = now.timeIntervalSince(updatedAt)
            return age >= 0 && age < interval
        }
    }

    struct Store {
        let directory: URL

        func load() -> Snapshot? {
            guard let data = try? Data(contentsOf: directory.appendingPathComponent("current-photos.json")) else { return nil }
            return try? JSONDecoder().decode(Snapshot.self, from: data)
        }

        func save(_ snapshot: Snapshot) throws {
            let data = try JSONEncoder().encode(snapshot)
            try data.write(to: directory.appendingPathComponent("current-photos.json"), options: .atomic)
        }

        // A file lock coordinates the app and extension, including separate widget processes.
        // Nonblocking acquisition lets callers keep the last good image if a refresh is in flight.
        func acquireRefreshLock() -> Int32? {
            let descriptor = open(directory.appendingPathComponent("photo-refresh.lock").path, O_CREAT | O_RDWR, S_IRUSR | S_IWUSR)
            guard descriptor >= 0 else { return nil }
            guard flock(descriptor, LOCK_EX | LOCK_NB) == 0 else {
                close(descriptor)
                return nil
            }
            return descriptor
        }

        func releaseRefreshLock(_ descriptor: Int32) {
            flock(descriptor, LOCK_UN)
            close(descriptor)
        }
    }

    static var store: Store? {
        containerURL.map { Store(directory: $0) }
    }

    static func recordRecent(_ snapshot: Snapshot) {
        guard let defaults = UserDefaults(suiteName: appGroupID) else { return }
        recordRecentJPEGData(snapshot.standard.data, caption: snapshot.standard.caption,
                             postId: snapshot.standard.postId, defaults: defaults)
    }

    private static var containerURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID)
    }

    static func imageFileURL(for variant: SnapshotVariant = .standard) -> URL? {
        containerURL?.appendingPathComponent(variant.fileName)
    }

    private static func recentsDirectoryURL() -> URL? {
        containerURL?.appendingPathComponent(recentsDirectoryName, isDirectory: true)
    }

    static func loadImage(for variant: SnapshotVariant = .standard) -> UIImage? {
        guard let data = displayJPEGData(for: variant) else { return nil }
        return UIImage(data: data)
    }

    /// Presentation-only fallback: bundled artwork never marks the snapshot fresh or enters recents.
    /// Both targets bundle the same samples so first launch and offline widgets agree.
    static func displayJPEGData(for variant: SnapshotVariant = .standard) -> Data? {
        loadSnapshotJPEGData(for: variant) ?? bundledJPEGData(for: variant)
    }

    static func bundledJPEGData(for variant: SnapshotVariant) -> Data? {
        let name = variant == .medium ? "WidgetDefaultMedium" : "WidgetDefaultSquare"
        return UIImage(named: name)?.jpegData(compressionQuality: 0.9)
    }

    /// Raw bytes of the cached widget JPEG for the requested widget shape.
    static func loadSnapshotJPEGData(for variant: SnapshotVariant = .standard) -> Data? {
        if let snapshot = store?.load() { return snapshot.photo(for: variant)?.data }
        guard let url = imageFileURL(for: variant) else { return nil }
        return try? Data(contentsOf: url)
    }

    static func loadCaption(for variant: SnapshotVariant = .standard) -> String? {
        if let snapshot = store?.load() { return snapshot.photo(for: variant)?.caption }
        return UserDefaults(suiteName: appGroupID)?.string(forKey: captionKey)
    }

    static func loadRecentItems() -> [RecentItem] {
        guard let defaults = UserDefaults(suiteName: appGroupID),
              let data = defaults.data(forKey: recentsKey),
              let items = try? JSONDecoder().decode([RecentItem].self, from: data) else {
            return []
        }
        return items.filter { imageData(forRecent: $0) != nil }
    }

    static func imageData(forRecent item: RecentItem) -> Data? {
        guard let directory = recentsDirectoryURL() else { return nil }
        let url = directory.appendingPathComponent(item.fileName)
        guard let data = try? Data(contentsOf: url), data.count > 32 else { return nil }
        return data
    }

    static func image(forRecent item: RecentItem) -> UIImage? {
        guard let data = imageData(forRecent: item) else { return nil }
        return UIImage(data: data)
    }

    static func snapshotLastUpdated(for variant: SnapshotVariant = .standard) -> Date? {
        if let snapshot = store?.load() { return snapshot.updatedAt }
        let t = UserDefaults(suiteName: appGroupID)?.double(forKey: variant.updatedAtKey) ?? 0
        return t > 0 ? Date(timeIntervalSince1970: t) : nil
    }

    static var lastUpdated: Date? {
        snapshotLastUpdated()
    }

    private static func recordRecentJPEGData(_ data: Data, caption: String?, postId: UUID?, defaults: UserDefaults) {
        guard let directory = recentsDirectoryURL() else { return }
        do {
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

            let now = Date().timeIntervalSince1970
            let stableID = postId?.uuidString ?? String(Int(now * 1000))
            let fileName = "\(stableID).jpg"
            let fileURL = directory.appendingPathComponent(fileName)
            try data.write(to: fileURL, options: [.atomic])

            let newItem = RecentItem(id: stableID, fileName: fileName, caption: caption, updatedAt: now)
            var items = loadRecentItems()
            items.removeAll { $0.id == stableID }
            items.insert(newItem, at: 0)

            let kept = Array(items.prefix(maxRecentItems))
            let keepFileNames = Set(kept.map(\.fileName))
            if let existing = try? FileManager.default.contentsOfDirectory(atPath: directory.path) {
                for file in existing where !keepFileNames.contains(file) {
                    try? FileManager.default.removeItem(at: directory.appendingPathComponent(file))
                }
            }

            if let encoded = try? JSONEncoder().encode(kept) {
                defaults.set(encoded, forKey: recentsKey)
            }
        } catch {}
    }
}
