//
//  DailyWidgetExtension.swift
//  DailyWidgetExtension
//
//  Created by Arya Patel on 2026-03-10.
//

import Supabase
import SwiftUI
import UIKit
import WidgetKit

/// One row returned by get_random_post() RPC.
struct RandomPostRow: Decodable {
    let id: UUID
    let storage_path: String
    let caption: String?
}

struct RandomPostEntry: TimelineEntry {
    let date: Date
    let imageData: Data?
    let caption: String?
}

struct RandomPostProvider: TimelineProvider {
    private let refreshIntervalKey = "photo.refreshIntervalSeconds"
    private let appGroupID = "group.com.aryapatel.glance1234"

    func placeholder(in context: Context) -> RandomPostEntry {
        RandomPostEntry(date: Date(), imageData: nil, caption: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (RandomPostEntry) -> Void) {
        completion(RandomPostEntry(date: Date(), imageData: nil, caption: nil))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<RandomPostEntry>) -> Void) {
        Task {
            let refreshDate = Date().addingTimeInterval(currentRefreshInterval())

            let useSharedFileOnly = SharedPhotoSnapshot.consumeNextWidgetTimelineUsesSharedSnapshotOnlyIfReady()
                || SharedPhotoSnapshot.widgetShouldReuseSnapshotInsteadOfRandomFetchIncludingFreshFile()
            if useSharedFileOnly {
                let fileData = SharedPhotoSnapshot.loadSnapshotJPEGData()
                let caption = SharedPhotoSnapshot.loadCaption()
                let entry = RandomPostEntry(date: Date(), imageData: fileData, caption: caption)
                DispatchQueue.main.async {
                    completion(Timeline(entries: [entry], policy: .after(refreshDate)))
                }
                return
            }

            do {
                let client = SupabaseClient(supabaseURL: SupabaseConfig.url, supabaseKey: SupabaseConfig.anonKey)
                let rows: [RandomPostRow] = try await client.rpc("get_random_post").execute().value

                guard let row = rows.first else {
                    let entry = RandomPostEntry(date: Date(), imageData: nil, caption: nil)
                    DispatchQueue.main.async {
                        completion(Timeline(entries: [entry], policy: .after(refreshDate)))
                    }
                    return
                }

                let imageURL = SupabaseConfig.publicImageURL(storagePath: row.storage_path)

                // Load and downscale the image so it fits WidgetKit's archival limits.
                let rawData = try? Data(contentsOf: imageURL)
                let resizedData: Data?
                if let rawData,
                   let uiImage = UIImage(data: rawData) {
                    let resized = uiImage.resized(maxDimension: 800)
                    resizedData = resized.jpegData(compressionQuality: 0.9)
                } else {
                    resizedData = rawData
                }

                let entry = RandomPostEntry(date: Date(), imageData: resizedData, caption: row.caption)

                if let data = resizedData {
                    SharedPhotoSnapshot.writeJPEGData(data, caption: row.caption, postId: row.id)
                }

                DispatchQueue.main.async {
                    completion(Timeline(entries: [entry], policy: .after(refreshDate)))
                }
            } catch {
                let entry = RandomPostEntry(date: Date(), imageData: nil, caption: nil)
                DispatchQueue.main.async {
                    completion(Timeline(entries: [entry], policy: .after(refreshDate)))
                }
            }
        }
    }

    private func currentRefreshInterval() -> TimeInterval {
        guard let defaults = UserDefaults(suiteName: appGroupID) else {
            return 24 * 60 * 60
        }

        let seconds = defaults.double(forKey: refreshIntervalKey)
        let allowed: Set<Int> = [1800, 3600, 7200, 43200, 86400]
        if allowed.contains(Int(seconds)) {
            return seconds
        }
        return 24 * 60 * 60
    }
}

struct DailyWidgetExtensionEntryView: View {
    let entry: RandomPostEntry

    /// Prefer the shared app-group file so the widget matches the main app preview pixel-for-pixel.
    private var displayUIImage: UIImage? {
        if let fromDisk = SharedPhotoSnapshot.loadImage() { return fromDisk }
        if let data = entry.imageData { return UIImage(data: data) }
        return nil
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
                        .id(SharedPhotoSnapshot.lastUpdated?.timeIntervalSince1970 ?? 0)
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
        .configurationDisplayName("Daily Photo")
        .description("Shows a new photo from Glance.")
        .supportedFamilies([.systemSmall])
        .contentMarginsDisabled()
    }
}

#Preview(as: .systemSmall) {
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
