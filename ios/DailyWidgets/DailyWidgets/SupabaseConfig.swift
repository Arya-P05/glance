import Foundation
import Supabase

/// Supabase URL and anon key for read-only access (widget + app).
/// Replace with your project values from Supabase Dashboard → Project Settings → API.
enum SupabaseConfig {
    static let url = URL(string: "https://hvjwvwxzwayxlgdopxii.supabase.co")!
    static let anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2and2d3h6d2F5eGxnZG9weGlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxOTEwOTksImV4cCI6MjA4ODc2NzA5OX0.UzgJ4QPJc5yfZw7r3XwIRYxRYyGV8QKs71ayqy9iXWc"

    /// Opts into upcoming auth “initial session” behavior and silences the SDK console warning. Harmless for anon RPC-only use; if you later observe `auth.authStateChanges`, check `session?.isExpired` per [supabase-swift#822](https://github.com/supabase/supabase-swift/pull/822).
    static func makeClient() -> SupabaseClient {
        SupabaseClient(
            supabaseURL: url,
            supabaseKey: anonKey,
            options: .init(auth: .init(emitLocalSessionAsInitialSession: true))
        )
    }

    /// Public URL for an image in the `instagram-posts` bucket.
    static func publicImageURL(storagePath: String) -> URL {
        let projectRef = url.host?.components(separatedBy: ".").first ?? "your-project"
        return URL(string: "https://\(projectRef).supabase.co/storage/v1/object/public/instagram-posts/\(storagePath)")!
    }

    // Match the existing on-device resolution. Resize on the server so originals
    // never need to cross the network just to be reduced to this size.
    static let widgetImageMaxDimension = 800

    static func widgetImageURL(storagePath: String) -> URL {
        // The Instagram import pipeline already writes <=800px JPEGs here.
        // Re-encoding these as high-quality WebP can actually increase their size.
        if storagePath.hasPrefix("posts/"), storagePath.lowercased().hasSuffix(".jpg") {
            return url.appendingPathComponent("storage/v1/object/public/instagram-posts")
                .appendingPathComponent(storagePath)
        }
        let imageURL = url.appendingPathComponent("storage/v1/render/image/public/instagram-posts")
            .appendingPathComponent(storagePath)
        var components = URLComponents(url: imageURL, resolvingAgainstBaseURL: false)!
        components.queryItems = [
            URLQueryItem(name: "width", value: String(widgetImageMaxDimension)),
            URLQueryItem(name: "height", value: String(widgetImageMaxDimension)),
            URLQueryItem(name: "resize", value: "contain"),
            URLQueryItem(name: "quality", value: "95"),
        ]
        return components.url!
    }
}
