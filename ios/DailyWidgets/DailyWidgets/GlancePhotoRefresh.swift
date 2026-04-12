import Foundation
import Supabase
import UIKit

/// `get_random_post` + image in the main app, write app-group JPEG; next widget reload reads that file (see `SharedPhotoSnapshot`).
enum GlancePhotoRefresh {
    private struct RandomPostRow: Decodable {
        let id: UUID
        let storage_path: String
        let caption: String?
    }

    /// Runs the Supabase RPC, downloads the image, resizes like the widget, and writes `SharedPhotoSnapshot`.
    /// - Returns: `true` if JPEG data was written to the app group.
    @discardableResult
    static func fetchAndWriteSharedSnapshot() async -> Bool {
        do {
            let client = SupabaseClient(supabaseURL: SupabaseConfig.url, supabaseKey: SupabaseConfig.anonKey)
            let rows: [RandomPostRow] = try await client.rpc("get_random_post").execute().value
            guard let row = rows.first else { return false }

            let imageURL = SupabaseConfig.publicImageURL(storagePath: row.storage_path)
            let rawData = await Task.detached(priority: .userInitiated) {
                try? Data(contentsOf: imageURL)
            }.value

            guard let rawData, !rawData.isEmpty else { return false }

            let resizedData: Data?
            if let uiImage = UIImage(data: rawData) {
                let resized = uiImage.resized(maxDimension: 800)
                resizedData = resized.jpegData(compressionQuality: 0.9)
            } else {
                resizedData = rawData
            }

            guard let data = resizedData else { return false }

            SharedPhotoSnapshot.writeJPEGData(data, caption: row.caption, postId: row.id)
            SharedPhotoSnapshot.recordMainAppWroteSnapshot()
            SharedPhotoSnapshot.markNextWidgetTimelineReloadUsesSharedSnapshotOnly()
            return true
        } catch {
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
