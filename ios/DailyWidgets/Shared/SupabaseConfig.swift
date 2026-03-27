import Foundation

/// Supabase URL and anon key for read-only access (widget + app).
/// Replace with your project values from Supabase Dashboard → Project Settings → API.
enum SupabaseConfig {
    static let url = URL(string: "https://your-project.supabase.co")!
    static let anonKey = "your-anon-key"

    /// Public URL for an image in the `instagram-posts` bucket.
    static func publicImageURL(storagePath: String) -> URL {
        let projectRef = url.host?.components(separatedBy: ".").first ?? "your-project"
        return URL(string: "https://\(projectRef).supabase.co/storage/v1/object/public/instagram-posts/\(storagePath)")!
    }
}

