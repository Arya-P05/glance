import Foundation
import UIKit

/// Mirrors the widget’s current photo into the App Group so the main app can share, save, or copy it.
/// `appGroupID` must match the widget extension’s App Group entitlement.
enum SharedPhotoSnapshot {
    static let appGroupID = "group.com.aryapatel.glance1234"

    private static let jpegFileName = "glance-widget-current.jpg"
    private static let updatedAtKey = "photo.shared.updatedAt"
    private static let captionKey = "photo.shared.caption"
    private static let postIdKey = "photo.shared.postId"
    /// When set (epoch seconds), widget `getTimeline` should reuse the on-disk JPEG instead of `get_random_post` so it matches the main app.
    private static let widgetSkipRandomUntilKey = "photo.shared.widgetSkipRandomUntil"
    /// Main app sets this before `reloadTimelines` so the *next* `getTimeline` uses the JPEG already on disk (one network fetch in the app only).
    private static let nextWidgetTimelineUsesAppSnapshotOnlyKey = "photo.shared.nextTimelineUsesAppSnapshotOnly"

    private static var containerURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID)
    }

    static func imageFileURL() -> URL? {
        containerURL?.appendingPathComponent(jpegFileName)
    }

    /// Called from the widget timeline when a new image is ready.
    static func writeJPEGData(_ data: Data, caption: String?, postId: UUID?) {
        guard let url = imageFileURL() else { return }
        do {
            try data.write(to: url, options: [.atomic])
            guard let defaults = UserDefaults(suiteName: appGroupID) else { return }
            defaults.set(Date().timeIntervalSince1970, forKey: updatedAtKey)
            if let caption {
                defaults.set(caption, forKey: captionKey)
            } else {
                defaults.removeObject(forKey: captionKey)
            }
            if let postId {
                defaults.set(postId.uuidString, forKey: postIdKey)
            } else {
                defaults.removeObject(forKey: postIdKey)
            }
        } catch {}
    }

    static func loadImage() -> UIImage? {
        guard let data = loadSnapshotJPEGData() else { return nil }
        return UIImage(data: data)
    }

    /// Raw bytes of the shared widget JPEG (same file the main app previews).
    static func loadSnapshotJPEGData() -> Data? {
        guard let url = imageFileURL() else { return nil }
        return try? Data(contentsOf: url)
    }

    /// Call from the **main app** after a successful `writeJPEGData` so the next widget reload does not fetch a different random post.
    static func recordMainAppWroteSnapshot(coalesceSeconds: TimeInterval = 120) {
        guard let defaults = UserDefaults(suiteName: appGroupID) else { return }
        let until = Date().addingTimeInterval(coalesceSeconds)
        defaults.set(until.timeIntervalSince1970, forKey: widgetSkipRandomUntilKey)
    }

    /// Call from the main app **after** writing the snapshot and **before** `WidgetCenter.reloadTimelines`. The next `getTimeline` should read that file only (no second Supabase call).
    static func markNextWidgetTimelineReloadUsesSharedSnapshotOnly() {
        guard let defaults = UserDefaults(suiteName: appGroupID) else { return }
        defaults.set(true, forKey: nextWidgetTimelineUsesAppSnapshotOnlyKey)
    }

    /// Widget: `true` once if the app reserved this reload for the on-disk snapshot. Clears the flag; falls back to RPC if the file is missing.
    static func consumeNextWidgetTimelineUsesSharedSnapshotOnlyIfReady() -> Bool {
        guard let defaults = UserDefaults(suiteName: appGroupID) else { return false }
        guard defaults.bool(forKey: nextWidgetTimelineUsesAppSnapshotOnlyKey) else { return false }
        defaults.set(false, forKey: nextWidgetTimelineUsesAppSnapshotOnlyKey)
        guard let data = loadSnapshotJPEGData(), data.count > 32 else { return false }
        return true
    }

    /// Widget: `true` when the app asked us to reuse the on-disk snapshot instead of calling `get_random_post`.
    static func widgetShouldReuseSnapshotInsteadOfRandomFetch(now: Date = Date()) -> Bool {
        guard let raw = UserDefaults(suiteName: appGroupID)?.double(forKey: widgetSkipRandomUntilKey), raw > 0 else {
            return false
        }
        let until = Date(timeIntervalSince1970: raw)
        guard now < until else { return false }
        guard let data = loadSnapshotJPEGData(), data.count > 32 else { return false }
        return true
    }

    /// Widget: snapshot was written moments ago (any writer). Catches races where prefs aren’t visible to the extension yet but the file + `updatedAt` already match the app.
    static func widgetShouldReuseVeryFreshSnapshot(maxAge: TimeInterval = 8, now: Date = Date()) -> Bool {
        guard let u = lastUpdated else { return false }
        let age = now.timeIntervalSince(u)
        guard age >= 0, age <= maxAge else { return false }
        guard let data = loadSnapshotJPEGData(), data.count > 32 else { return false }
        return true
    }

    /// Single gate for “use on-disk JPEG, do not call `get_random_post`.”
    static func widgetShouldReuseSnapshotInsteadOfRandomFetchIncludingFreshFile(now: Date = Date()) -> Bool {
        widgetShouldReuseSnapshotInsteadOfRandomFetch(now: now) || widgetShouldReuseVeryFreshSnapshot(now: now)
    }

    static func loadCaption() -> String? {
        UserDefaults(suiteName: appGroupID)?.string(forKey: captionKey)
    }

    static var lastUpdated: Date? {
        let t = UserDefaults(suiteName: appGroupID)?.double(forKey: updatedAtKey) ?? 0
        return t > 0 ? Date(timeIntervalSince1970: t) : nil
    }
}
