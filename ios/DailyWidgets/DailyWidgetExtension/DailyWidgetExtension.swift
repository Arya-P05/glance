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

struct RandomPostEntry: TimelineEntry {
    let date: Date
    let imageData: Data?
    let caption: String?
}

struct RandomPostProvider: TimelineProvider {
    func placeholder(in context: Context) -> RandomPostEntry {
        let variant = snapshotVariant(for: context.family)
        return RandomPostEntry(
            date: Date(),
            imageData: SharedPhotoSnapshot.displayJPEGData(for: variant),
            caption: SharedPhotoSnapshot.loadCaption(for: variant)
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (RandomPostEntry) -> Void) {
        let variant = snapshotVariant(for: context.family)
        let entry = RandomPostEntry(
            date: Date(),
            imageData: SharedPhotoSnapshot.displayJPEGData(for: variant),
            caption: SharedPhotoSnapshot.loadCaption(for: variant)
        )
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<RandomPostEntry>) -> Void) {
        Task {
            let refreshed = await GlancePhotoRefresh.refresh()
            let variant = snapshotVariant(for: context.family)
            // Read one committed generation. A network failure keeps the last good photo.
            let snapshot = SharedPhotoSnapshot.store?.load()
            let entry = RandomPostEntry(
                date: Date(),
                imageData: snapshot?.photo(for: variant)?.data ?? SharedPhotoSnapshot.displayJPEGData(for: variant),
                caption: snapshot?.photo(for: variant)?.caption ?? SharedPhotoSnapshot.loadCaption(for: variant)
            )
            let next: Date
            if refreshed, let snapshot {
                next = max(Date().addingTimeInterval(1), snapshot.updatedAt.addingTimeInterval(GlancePhotoRefresh.refreshInterval))
            } else {
                next = Date().addingTimeInterval(300)
            }
            completion(Timeline(entries: [entry], policy: .after(next)))
        }
    }

    private func snapshotVariant(for family: WidgetFamily) -> SharedPhotoSnapshot.SnapshotVariant {
        family == .systemMedium ? .medium : .standard
    }
}

struct DailyWidgetExtensionEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: RandomPostEntry

    private var displayImage: UIImage? {
        if let data = entry.imageData, let image = UIImage(data: data) { return image }
        let variant: SharedPhotoSnapshot.SnapshotVariant = family == .systemMedium ? .medium : .standard
        return SharedPhotoSnapshot.bundledJPEGData(for: variant).flatMap { UIImage(data: $0) }
    }

    var body: some View {
        Group {
            if let image = displayImage {
                Image(uiImage: image)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .clipped()
                    .unredacted()
            } else {
                ZStack {
                    Color.gray.opacity(0.2)
                    Image(systemName: "photo")
                        .font(.title2)
                        .foregroundStyle(.secondary)
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
