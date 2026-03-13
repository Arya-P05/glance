import WidgetKit
import SwiftUI
import Supabase

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
    func placeholder(in context: Context) -> RandomPostEntry {
        RandomPostEntry(date: Date(), imageData: nil, caption: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (RandomPostEntry) -> Void) {
        let entry = RandomPostEntry(date: Date(), imageData: nil, caption: nil)
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<RandomPostEntry>) -> Void) {
        Task {
            let entry: RandomPostEntry
            let refreshDate: Date

            do {
                let client = SupabaseClient(
                    supabaseURL: SupabaseConfig.url,
                    supabaseKey: SupabaseConfig.anonKey
                )
                let rows: [RandomPostRow] = try await client.rpc("get_random_post").execute().value
                guard let row = rows.first else {
                    entry = RandomPostEntry(date: Date(), imageData: nil, caption: nil)
                    refreshDate = startOfNextDay()
                    DispatchQueue.main.async {
                        completion(Timeline(entries: [entry], policy: .after(refreshDate)))
                    }
                    return
                }

                let imageURL = SupabaseConfig.publicImageURL(storagePath: row.storage_path)
                let imageData = try? Data(contentsOf: imageURL)

                entry = RandomPostEntry(
                    date: Date(),
                    imageData: imageData,
                    caption: row.caption
                )
                refreshDate = startOfNextDay()
            } catch {
                entry = RandomPostEntry(date: Date(), imageData: nil, caption: nil)
                refreshDate = startOfNextDay()
            }

            let timeline = Timeline(entries: [entry], policy: .after(refreshDate))
            DispatchQueue.main.async {
                completion(timeline)
            }
        }
    }

    private func startOfNextDay() -> Date {
        let calendar = Calendar.current
        let tomorrow = calendar.date(byAdding: .day, value: 1, to: Date()) ?? Date()
        return calendar.startOfDay(for: tomorrow)
    }
}

struct RandomPostWidgetEntryView: View {
    var entry: RandomPostEntry
    @Environment(\.widgetFamily) var family

    var body: some View {
        Group {
            if let data = entry.imageData, let uiImage = UIImage(data: data) {
                Image(uiImage: uiImage)
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.black.opacity(0.05))
            } else {
                placeholderView
            }
        }
    }

    private var placeholderView: some View {
        VStack(spacing: 8) {
            Image(systemName: "photo")
                .font(.largeTitle)
            Text("No image")
                .font(.caption)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.gray.opacity(0.2))
    }
}

struct RandomPostWidget: Widget {
    let kind: String = "RandomPostWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: RandomPostProvider()) { entry in
            RandomPostWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Random Post")
        .description("Shows a random image from our feed every day.")
    }
}

#Preview(as: .systemSmall) {
    RandomPostWidget()
} timeline: {
    RandomPostEntry(date: Date(), imageData: nil, caption: nil)
}
