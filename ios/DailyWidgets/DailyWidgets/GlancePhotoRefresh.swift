import Foundation
import Supabase
import UIKit
import WidgetKit

/// Both the app and all widget families use this single selection and download path.
enum GlancePhotoRefresh {
    private struct RandomPostRow: Decodable {
        let id: UUID
        let storage_path: String
        let medium_storage_path: String?
        let medium_eligible: Bool?
        let caption: String?
    }

    static var refreshInterval: TimeInterval {
        let seconds = UserDefaults(suiteName: SharedPhotoSnapshot.appGroupID)?.double(forKey: "photo.refreshIntervalSeconds") ?? 0
        return [1800, 3600, 7200, 43200, 86400].contains(Int(seconds)) ? seconds : 3600
    }

    @discardableResult
    static func fetchAndWriteSharedSnapshot() async -> Bool {
        await refresh(force: true)
    }

    /// Hold the cross-process lock through selection, download and commit. Waiting callers
    /// recheck freshness after acquiring it, so different widget families cannot pick new posts.
    @discardableResult
    static func refresh(force: Bool = false) async -> Bool {
        guard let store = SharedPhotoSnapshot.store else { return false }
        return await refresh(store: store, force: force, interval: refreshInterval, fetch: fetchSnapshot) { snapshot in
            SharedPhotoSnapshot.recordRecent(snapshot)
            // Other sizes may already have a rendered timeline from the previous generation.
            WidgetCenter.shared.reloadTimelines(ofKind: "DailyWidgetExtension")
        }
    }

    static func refresh(
        store: SharedPhotoSnapshot.Store,
        force: Bool,
        interval: TimeInterval,
        fetch: () async throws -> SharedPhotoSnapshot.Snapshot?,
        didCommit: (SharedPhotoSnapshot.Snapshot) -> Void = { _ in }
    ) async -> Bool {
        var descriptor: Int32?
        for _ in 0..<50 {
            descriptor = store.acquireRefreshLock()
            if descriptor != nil { break }
            do { try await Task.sleep(nanoseconds: 100_000_000) } catch { return false }
        }
        guard let descriptor else { return false }
        defer { store.releaseRefreshLock(descriptor) }

        if !force, let snapshot = store.load(), snapshot.isFresh(interval: interval) {
            return true
        }

        do {
            guard let snapshot = try await fetch() else { return false }
            try Task.checkCancellation()
            try store.save(snapshot)
            didCommit(snapshot)
            return true
        } catch {
            return false
        }
    }

    private static func fetchSnapshot() async throws -> SharedPhotoSnapshot.Snapshot? {
        let client = SupabaseConfig.makeClient()
        let rows: [RandomPostRow] = try await client.rpc("get_widget_post", params: ["widget_format": "square"]).execute().value
        guard let row = rows.first,
              let data = await loadResizedJPEGData(storagePath: row.storage_path) else { return nil }

        let mediumRow: RandomPostRow?
        if row.medium_eligible == false {
            let rows: [RandomPostRow] = try await client.rpc("get_widget_post", params: ["widget_format": "medium"]).execute().value
            mediumRow = rows.first
        } else {
            mediumRow = row
        }
        let mediumPhoto: SharedPhotoSnapshot.Photo?
        if let mediumRow {
            let mediumPath = mediumRow.medium_storage_path ?? mediumRow.storage_path
            let mediumData: Data
            if mediumPath == row.storage_path {
                mediumData = data
            } else {
                guard let downloaded = await loadResizedJPEGData(storagePath: mediumPath) else { return nil }
                mediumData = downloaded
            }
            mediumPhoto = .init(data: mediumData, caption: mediumRow.caption, postId: mediumRow.id)
        } else {
            // A library with only square-approved posts must still serve square widgets.
            mediumPhoto = nil
        }

        return SharedPhotoSnapshot.Snapshot(
            standard: .init(data: data, caption: row.caption, postId: row.id),
            medium: mediumPhoto,
            updatedAt: Date()
        )
    }

    private static func loadResizedJPEGData(storagePath: String) async -> Data? {
        var request = URLRequest(url: SupabaseConfig.publicImageURL(storagePath: storagePath), cachePolicy: .reloadIgnoringLocalCacheData)
        request.timeoutInterval = 25
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode),
                  let image = UIImage(data: data) else { return nil }
            let scale = min(1, 800 / max(image.size.width, image.size.height))
            let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
            let format = UIGraphicsImageRendererFormat()
            format.scale = 1
            return UIGraphicsImageRenderer(size: size, format: format).image { _ in
                image.draw(in: CGRect(origin: .zero, size: size))
            }.jpegData(compressionQuality: 0.9)
        } catch {
            return nil
        }
    }
}
