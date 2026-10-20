import Foundation
import Testing
@testable import DailyWidgets

struct DailyWidgetsTests {
    @Test func alreadyOptimizedImportsKeepTheirOriginalBytes() {
        let url = SupabaseConfig.widgetImageURL(storagePath: "posts/import-1.jpg")
        #expect(url.path == "/storage/v1/object/public/instagram-posts/posts/import-1.jpg")
        #expect(url.query == nil)
        // JPEGs from other pipelines aren't guaranteed to be widget-sized.
        #expect(SupabaseConfig.widgetImageURL(storagePath: "drafts/large.jpg").path.contains("/render/image/"))
    }

    @Test func widgetDownloadsAreSizedBeforeTransferAndAllowCaching() throws {
        let path = "drafts/captioned/photo #1.png"
        let request = GlancePhotoRefresh.imageRequest(storagePath: path)
        let url = try #require(request.url)
        let components = try #require(URLComponents(url: url, resolvingAgainstBaseURL: false))
        #expect(url.path == "/storage/v1/render/image/public/instagram-posts/\(path)")
        #expect(components.fragment == nil)
        let options = Dictionary(uniqueKeysWithValues: (components.queryItems ?? []).map { ($0.name, $0.value) })
        #expect(options["width"] == "800")
        #expect(options["height"] == "800")
        #expect(options["resize"] == "contain")
        #expect(options["quality"] == "95")
        #expect(request.value(forHTTPHeaderField: "Accept") == "image/webp")
        #expect(request.cachePolicy == .useProtocolCachePolicy)
    }

    private func snapshot(at date: Date = Date()) -> SharedPhotoSnapshot.Snapshot {
        .init(
            standard: .init(data: Data(repeating: 1, count: 64), caption: "square", postId: UUID()),
            medium: .init(data: Data(repeating: 2, count: 64), caption: "wide", postId: UUID()),
            updatedAt: date
        )
    }

    private func temporaryStore() throws -> SharedPhotoSnapshot.Store {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        return .init(directory: directory)
    }

    @Test func delayedWidgetReloadReusesImageForFullRefreshInterval() {
        let start = Date(timeIntervalSince1970: 1_000)
        let saved = snapshot(at: start)
        // The old two-minute gate allowed a delayed widget reload to select a different post.
        #expect(saved.isFresh(interval: 3600, now: start.addingTimeInterval(121)))
        #expect(saved.isFresh(interval: 3600, now: start.addingTimeInterval(3599)))
        #expect(!saved.isFresh(interval: 3600, now: start.addingTimeInterval(3600)))
        #expect(!saved.isFresh(interval: 1800, now: start.addingTimeInterval(1800)))
        #expect(!saved.isFresh(interval: 3600, now: start.addingTimeInterval(-1)))
    }

    @Test func imageAndMetadataStayWithTheirWidgetSize() throws {
        let store = try temporaryStore()
        defer { try? FileManager.default.removeItem(at: store.directory) }
        let saved = snapshot()
        try store.save(saved)
        let loaded = try #require(store.load())
        #expect(loaded == saved)
        #expect(loaded.photo(for: .standard) == saved.standard)
        #expect(loaded.photo(for: .medium) == saved.medium)
        #expect(loaded.standard.postId != loaded.medium?.postId)
    }

    @Test func competingWidgetWriterCannotAcquireRefreshLock() throws {
        let app = try temporaryStore()
        defer { try? FileManager.default.removeItem(at: app.directory) }
        let widget = SharedPhotoSnapshot.Store(directory: app.directory)
        let appLock = try #require(app.acquireRefreshLock())
        let competingLock = widget.acquireRefreshLock()
        if let competingLock { widget.releaseRefreshLock(competingLock) }
        #expect(competingLock == nil)
        app.releaseRefreshLock(appLock)
        let widgetLock = try #require(widget.acquireRefreshLock())
        widget.releaseRefreshLock(widgetLock)
    }

    @Test func waitingWidgetSeesCommittedGenerationBeforeSelecting() throws {
        let app = try temporaryStore()
        defer { try? FileManager.default.removeItem(at: app.directory) }
        let widget = SharedPhotoSnapshot.Store(directory: app.directory)
        let appLock = try #require(app.acquireRefreshLock())
        let saved = snapshot()
        try app.save(saved)
        app.releaseRefreshLock(appLock)
        let widgetLock = try #require(widget.acquireRefreshLock())
        defer { widget.releaseRefreshLock(widgetLock) }
        let loaded = try #require(widget.load())
        #expect(loaded.isFresh(interval: 3600))
        #expect(loaded == saved)
    }

    @Test func readersNeverSeeMixedImageGenerations() async throws {
        let store = try temporaryStore()
        defer { try? FileManager.default.removeItem(at: store.directory) }
        let first = snapshot()
        let second = snapshot()
        try store.save(first)
        try await withThrowingTaskGroup(of: Void.self) { group in
            group.addTask {
                for i in 0..<100 { try store.save(i.isMultiple(of: 2) ? second : first) }
            }
            group.addTask {
                for _ in 0..<100 {
                    let loaded = store.load()
                    #expect(loaded == first || loaded == second)
                }
            }
            try await group.waitForAll()
        }
    }

    private actor FetchCounter {
        var count = 0
        func increment() { count += 1 }
    }

    @Test func simultaneousFamilyRefreshesFetchOnlyOnce() async throws {
        let store = try temporaryStore()
        defer { try? FileManager.default.removeItem(at: store.directory) }
        let counter = FetchCounter()
        let saved = snapshot()
        await withTaskGroup(of: Bool.self) { group in
            for _ in 0..<3 {
                group.addTask {
                    await GlancePhotoRefresh.refresh(store: store, force: false, interval: 3600) {
                        await counter.increment()
                        try await Task.sleep(nanoseconds: 150_000_000)
                        return saved
                    }
                }
            }
            for await success in group { #expect(success) }
        }
        #expect(await counter.count == 1)
        #expect(store.load() == saved)
    }

    @Test func failedRefreshPreservesBothPhotosAndReleasesLock() async throws {
        let store = try temporaryStore()
        defer { try? FileManager.default.removeItem(at: store.directory) }
        let saved = snapshot()
        try store.save(saved)
        let success = await GlancePhotoRefresh.refresh(store: store, force: true, interval: 3600) {
            throw URLError(.timedOut)
        }
        #expect(!success)
        #expect(store.load() == saved)
        let lock = try #require(store.acquireRefreshLock())
        store.releaseRefreshLock(lock)
    }

    @Test func manualRefreshReplacesFreshSnapshotAndDelayedReloadKeepsIt() async throws {
        let store = try temporaryStore()
        defer { try? FileManager.default.removeItem(at: store.directory) }
        try store.save(snapshot())
        let replacement = snapshot(at: Date().addingTimeInterval(-180))
        let forced = await GlancePhotoRefresh.refresh(store: store, force: true, interval: 3600) {
            replacement
        }
        #expect(forced)
        let reused = await GlancePhotoRefresh.refresh(store: store, force: false, interval: 3600) {
            Issue.record("A delayed widget reload must not select another random post")
            return nil
        }
        #expect(reused)
        #expect(store.load() == replacement)
    }


    @Test func squareOnlyLibraryDoesNotReuseAnUnapprovedMediumImage() throws {
        let store = try temporaryStore()
        defer { try? FileManager.default.removeItem(at: store.directory) }
        let previous = snapshot()
        try store.save(previous)
        let squareOnly = SharedPhotoSnapshot.Snapshot(standard: previous.standard, medium: nil, updatedAt: Date())
        try store.save(squareOnly)
        let loaded = try #require(store.load())
        #expect(loaded.photo(for: .standard) == previous.standard)
        #expect(loaded.photo(for: .medium) == nil)
    }

}
