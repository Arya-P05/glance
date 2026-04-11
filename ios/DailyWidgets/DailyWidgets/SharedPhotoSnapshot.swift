import Foundation
import UIKit

/// Mirrors the widget’s current photo into the App Group so the main app can share, save, or copy it.
/// `appGroupID` must match `SharedSunConfiguration.appGroupID` and the widget extension’s entitlements.
enum SharedPhotoSnapshot {
    static let appGroupID = "group.com.aryapatel.glance1234"

    private static let jpegFileName = "glance-widget-current.jpg"
    private static let updatedAtKey = "photo.shared.updatedAt"
    private static let captionKey = "photo.shared.caption"
    private static let postIdKey = "photo.shared.postId"

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
        guard let url = imageFileURL(),
              let data = try? Data(contentsOf: url),
              let image = UIImage(data: data) else { return nil }
        return image
    }

    static func loadCaption() -> String? {
        UserDefaults(suiteName: appGroupID)?.string(forKey: captionKey)
    }

    static var lastUpdated: Date? {
        let t = UserDefaults(suiteName: appGroupID)?.double(forKey: updatedAtKey) ?? 0
        return t > 0 ? Date(timeIntervalSince1970: t) : nil
    }
}
