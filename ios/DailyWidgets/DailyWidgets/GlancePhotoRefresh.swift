import Foundation
import Supabase
import UIKit

/// `get_random_post` + image in the main app, write app-group JPEG; next widget reload reads that file (see `SharedPhotoSnapshot`).
enum GlancePhotoRefresh {
    private struct RandomPostRow: Decodable {
        let id: UUID
        let storage_path: String
        let medium_storage_path: String?
    let medium_eligible: Bool?
        let caption: String?
    }

    /// Runs the Supabase RPC, downloads the image, resizes like the widget, and writes `SharedPhotoSnapshot`.
    /// - Returns: `true` if JPEG data was written to the app group.
    @discardableResult
    static func fetchAndWriteSharedSnapshot() async -> Bool {
        do {
            let client = SupabaseConfig.makeClient()
            let rows: [RandomPostRow] = try await client.rpc("get_widget_post", params: ["widget_format": "square"]).execute().value
            guard let row = rows.first else { return false }

            guard let data = await loadResizedJPEGData(storagePath: row.storage_path) else { return false }
            let mediumRows: [RandomPostRow] = row.medium_eligible == false
                ? try await client.rpc("get_widget_post", params: ["widget_format": "medium"]).execute().value
                : [row]
            let mediumRow = mediumRows.first
            let mediumData: Data?
            if let mediumRow,
               let mediumStoragePath = mediumRow.medium_storage_path ?? Optional(mediumRow.storage_path),
               let loadedMediumData = await loadResizedJPEGData(storagePath: mediumStoragePath) {
                mediumData = loadedMediumData
            } else {
                mediumData = row.medium_eligible == false ? nil : data
            }

            SharedPhotoSnapshot.writeJPEGData(data, caption: row.caption, postId: row.id)
            if let mediumData, let mediumRow {
                SharedPhotoSnapshot.writeJPEGData(
                    mediumData,
                    caption: mediumRow.caption,
                    postId: mediumRow.id,
                    variant: .medium,
                    recordRecent: false
                )
            }
            SharedPhotoSnapshot.recordMainAppWroteSnapshot()
            SharedPhotoSnapshot.markNextWidgetTimelineReloadUsesSharedSnapshotOnly()
            return true
        } catch {
            return false
        }
    }

    private static func loadResizedJPEGData(storagePath: String) async -> Data? {
        let imageURL = SupabaseConfig.publicImageURL(storagePath: storagePath)
        let rawData = await Task.detached(priority: .userInitiated) {
            try? Data(contentsOf: imageURL)
        }.value

        guard let rawData, !rawData.isEmpty else { return nil }

        if let uiImage = UIImage(data: rawData) {
            let resized = uiImage.resized(maxDimension: 800)
            return resized.jpegData(compressionQuality: 0.9)
        }

        return rawData
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
