//
//  DailyWidgetExtension.swift
//  DailyWidgetExtension
//
//  Created by Arya Patel on 2026-03-10.
//

import Foundation
import Supabase
import SwiftUI
import UIKit
import WidgetKit

/// One row returned by get_random_post() RPC.
struct RandomPostRow: Decodable {
    let id: UUID
    let storage_path: String
    let medium_storage_path: String?
    let medium_eligible: Bool?
    let caption: String?
}

struct RandomPostEntry: TimelineEntry {
    let date: Date
    let imageData: Data?
    let caption: String?
}

struct RandomPostProvider: TimelineProvider {
    private let refreshIntervalKey = "photo.refreshIntervalSeconds"
    private let appGroupID = SharedPhotoSnapshot.appGroupID
    /// When the timeline has no image yet, reload much sooner than the normal refresh interval.
    private let retryIntervalNoImage: TimeInterval = 300

    func placeholder(in context: Context) -> RandomPostEntry {
        let variant = snapshotVariant(for: context.family)
        return RandomPostEntry(
            date: Date(),
            imageData: SharedPhotoSnapshot.loadSnapshotJPEGData(for: variant),
            caption: SharedPhotoSnapshot.loadCaption()
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (RandomPostEntry) -> Void) {
        let variant = snapshotVariant(for: context.family)
        let entry = RandomPostEntry(
            date: Date(),
            imageData: SharedPhotoSnapshot.loadSnapshotJPEGData(for: variant),
            caption: SharedPhotoSnapshot.loadCaption()
        )
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<RandomPostEntry>) -> Void) {
        Task {
            let normalRefresh = Date().addingTimeInterval(currentRefreshInterval())
            let variant = snapshotVariant(for: context.family)

            let useSharedFileOnly =
                SharedPhotoSnapshot.consumeNextWidgetTimelineUsesSharedSnapshotOnlyIfReady(for: variant)
                || SharedPhotoSnapshot.widgetShouldReuseSnapshotInsteadOfRandomFetchIncludingFreshFile(for: variant)
            if useSharedFileOnly {
                let fileData = SharedPhotoSnapshot.loadSnapshotJPEGData(for: variant)
                let caption = SharedPhotoSnapshot.loadCaption()
                let entry = RandomPostEntry(date: Date(), imageData: fileData, caption: caption)
                let next = nextReloadDate(after: entry, normalRefresh: normalRefresh)
                DispatchQueue.main.async {
                    completion(Timeline(entries: [entry], policy: .after(next)))
                }
                return
            }

            do {
                let client = SupabaseConfig.makeClient()
                let rows: [RandomPostRow] = try await client.rpc("get_widget_post", params: ["widget_format": context.family == .systemMedium ? "medium" : "square"]).execute().value

                guard let row = rows.first else {
                    let entry = RandomPostEntry(date: Date(), imageData: nil, caption: nil)
                    let next = nextReloadDate(after: entry, normalRefresh: normalRefresh)
                    DispatchQueue.main.async {
                        completion(Timeline(entries: [entry], policy: .after(next)))
                    }
                    return
                }

                let storagePath = context.family == .systemMedium
                    ? (row.medium_storage_path ?? row.storage_path)
                    : row.storage_path
                let imageURL = SupabaseConfig.publicImageURL(storagePath: storagePath)
                let rawData = await loadImageData(from: imageURL)
                let resizedData = resizedJPEGData(from: rawData)

                let entry = RandomPostEntry(date: Date(), imageData: resizedData, caption: row.caption)

                await writeSharedSnapshots(
                    for: row,
                    displayData: resizedData,
                    displayStoragePath: storagePath,
                    family: context.family
                )

                let next = nextReloadDate(after: entry, normalRefresh: normalRefresh)
                DispatchQueue.main.async {
                    completion(Timeline(entries: [entry], policy: .after(next)))
                }
            } catch {
                let entry = RandomPostEntry(date: Date(), imageData: nil, caption: nil)
                let next = nextReloadDate(after: entry, normalRefresh: normalRefresh)
                DispatchQueue.main.async {
                    completion(Timeline(entries: [entry], policy: .after(next)))
                }
            }
        }
    }

    private func nextReloadDate(after entry: RandomPostEntry, normalRefresh: Date) -> Date {
        let hasImage = (entry.imageData?.count ?? 0) > 32
        if hasImage { return normalRefresh }
        let retry = Date().addingTimeInterval(retryIntervalNoImage)
        return min(normalRefresh, retry)
    }

    private func snapshotVariant(for family: WidgetFamily) -> SharedPhotoSnapshot.SnapshotVariant {
        family == .systemMedium ? .medium : .standard
    }

    private func resizedJPEGData(from rawData: Data?) -> Data? {
        guard let rawData else { return nil }
        if let uiImage = UIImage(data: rawData) {
            let resized = uiImage.resized(maxDimension: 800)
            return resized.jpegData(compressionQuality: 0.9)
        }
        return rawData
    }

    private func loadResizedJPEGData(storagePath: String) async -> Data? {
        let imageURL = SupabaseConfig.publicImageURL(storagePath: storagePath)
        return resizedJPEGData(from: await loadImageData(from: imageURL))
    }

    private func writeSharedSnapshots(
        for row: RandomPostRow,
        displayData: Data?,
        displayStoragePath: String,
        family: WidgetFamily
    ) async {
        guard let displayData else { return }

        let standardData: Data
        let mediumData: Data

        if family == .systemMedium {
            mediumData = displayData
            if displayStoragePath == row.storage_path {
                standardData = displayData
            } else {
                standardData = await loadResizedJPEGData(storagePath: row.storage_path) ?? displayData
            }
        } else {
            standardData = displayData
            if let mediumStoragePath = row.medium_storage_path,
               mediumStoragePath != row.storage_path {
                mediumData = await loadResizedJPEGData(storagePath: mediumStoragePath) ?? displayData
            } else {
                mediumData = displayData
            }
        }

        SharedPhotoSnapshot.writeJPEGData(standardData, caption: row.caption, postId: row.id)
        if row.medium_eligible != false {
            SharedPhotoSnapshot.writeJPEGData(
                mediumData,
                caption: row.caption,
                postId: row.id,
                variant: .medium,
                recordRecent: false
            )
        }
    }

    private func loadImageData(from url: URL) async -> Data? {
        var request = URLRequest(url: url)
        request.timeoutInterval = 25
        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else { return nil }
            return data
        } catch {
            return nil
        }
    }

    private func currentRefreshInterval() -> TimeInterval {
        guard let defaults = UserDefaults(suiteName: appGroupID) else {
            return 3600
        }

        let seconds = defaults.double(forKey: refreshIntervalKey)
        let allowed: Set<Int> = [1800, 3600, 7200, 43200, 86400]
        if allowed.contains(Int(seconds)) {
            return seconds
        }
        return 3600
    }
}

struct DailyWidgetExtensionEntryView: View {
    @Environment(\.widgetFamily) private var family

    let entry: RandomPostEntry

    /// Prefer the family-specific app-group file so timeline reloads and app refreshes stay on the same post.
    private var displayUIImage: UIImage? {
        if let fromDisk = SharedPhotoSnapshot.loadImage(for: snapshotVariant) { return fromDisk }
        if let data = entry.imageData { return UIImage(data: data) }
        return nil
    }

    private var snapshotVariant: SharedPhotoSnapshot.SnapshotVariant {
        family == .systemMedium ? .medium : .standard
    }

    var body: some View {
        // Re-read the app-group file on a schedule: timeline reloads can lag behind when the main app writes the snapshot.
        TimelineView(.periodic(from: Date(), by: 20)) { _ in
            Group {
                if let uiImage = displayUIImage {
                    Image(uiImage: uiImage)
                        .resizable()
                        .aspectRatio(contentMode: .fill)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .clipped()
                        .id(SharedPhotoSnapshot.snapshotLastUpdated(for: snapshotVariant)?.timeIntervalSince1970 ?? entry.date.timeIntervalSince1970)
                } else {
                    ZStack {
                        Color.gray.opacity(0.2)
                        Image(systemName: "photo")
                            .font(.title2)
                            .foregroundStyle(.secondary)
                    }
                }
            }
        }
        .containerBackground(.fill.tertiary, for: .widget)
    }
}

struct PhotoWidget: Widget {
    static let kind = "DailyWidgetExtension"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Self.kind, provider: RandomPostProvider()) { entry in
            DailyWidgetExtensionEntryView(entry: entry)
        }
        .configurationDisplayName("Glance")
        .description("A photo from Glance on your Home Screen.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
        .contentMarginsDisabled()
    }
}

#Preview(as: .systemSmall) {
    PhotoWidget()
} timeline: {
    RandomPostEntry(date: Date(), imageData: nil, caption: nil)
}

#Preview(as: .systemMedium) {
    PhotoWidget()
} timeline: {
    RandomPostEntry(date: Date(), imageData: nil, caption: nil)
}

#Preview(as: .systemLarge) {
    PhotoWidget()
} timeline: {
    RandomPostEntry(date: Date(), imageData: nil, caption: nil)
}

// MARK: - UIImage resizing for widgets

extension UIImage {
    /// Returns a copy of the image resized so that its longest side
    /// is at most `maxDimension` points, preserving aspect ratio.
    func resized(maxDimension: CGFloat) -> UIImage {
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
