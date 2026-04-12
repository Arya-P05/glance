import Foundation
import OSLog
import Supabase
import UIKit

/// Fetches **once** (`get_random_post` + image), writes the app-group JPEG, then the widget should reload and **read that file** — not call Supabase again.
/// Scheduled widget refreshes (hours later, app not running) still use `get_random_post` inside the extension.
enum GlancePhotoRefresh {
    private static let log = Logger(subsystem: "com.aryapatel.glance1234", category: "GlancePhoto")

    private struct RandomPostRow: Decodable {
        let id: UUID
        let storage_path: String
        let caption: String?
    }

    /// Runs the Supabase RPC, downloads the image, resizes like the widget, and writes `SharedPhotoSnapshot`.
    /// - Returns: `true` if JPEG data was written to the app group.
    @discardableResult
    static func fetchAndWriteSharedSnapshot() async -> Bool {
        log.info("App fetch: starting get_random_post RPC")
        do {
            let client = SupabaseClient(supabaseURL: SupabaseConfig.url, supabaseKey: SupabaseConfig.anonKey)
            let rows: [RandomPostRow] = try await client.rpc("get_random_post").execute().value
            guard let row = rows.first else {
                log.warning("App fetch: RPC returned no rows")
                return false
            }

            let imageURL = SupabaseConfig.publicImageURL(storagePath: row.storage_path)
            log.info("App fetch: downloading image (path redacted)")

            let rawData = await Task.detached(priority: .userInitiated) {
                try? Data(contentsOf: imageURL)
            }.value

            let byteCount = rawData?.count ?? 0
            if byteCount == 0 {
                log.error("App fetch: download failed or empty (\(byteCount) bytes)")
                return false
            }
            log.info("App fetch: downloaded \(byteCount) bytes")

            let resizedData: Data?
            if let rawData,
               let uiImage = UIImage(data: rawData) {
                let resized = uiImage.resized(maxDimension: 800)
                resizedData = resized.jpegData(compressionQuality: 0.9)
            } else {
                resizedData = rawData
            }

            guard let data = resizedData else {
                log.error("App fetch: could not produce JPEG data")
                return false
            }

            let before = SharedPhotoSnapshot.lastUpdated
            SharedPhotoSnapshot.writeJPEGData(data, caption: row.caption, postId: row.id)
            SharedPhotoSnapshot.recordMainAppWroteSnapshot()
            SharedPhotoSnapshot.markNextWidgetTimelineReloadUsesSharedSnapshotOnly()
            let after = SharedPhotoSnapshot.lastUpdated
            log.info("App fetch: wrote snapshot; lastUpdated before=\(String(describing: before), privacy: .public) after=\(String(describing: after), privacy: .public)")
            return true
        } catch {
            log.error("App fetch: failed — \(error.localizedDescription, privacy: .public)")
            return false
        }
    }
}

extension UIImage {
    /// Same scaling as the widget extension (longest side ≤ `maxDimension`).
    fileprivate func resized(maxDimension: CGFloat) -> UIImage {
        let maxSide = max(size.width, size.height)
        guard maxSide > maxDimension else { return self }

        let scale = maxDimension / maxSide
        let newSize = CGSize(width: size.width * scale, height: size.height * scale)

        let renderer = UIGraphicsImageRenderer(size: newSize)
        return renderer.image { _ in
            self.draw(in: CGRect(origin: .zero, size: newSize))
        }
    }
}
