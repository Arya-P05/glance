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
}

