import Foundation

/// Supabase URL and anon key for read-only access (widget + app).
/// Replace with your project values from Supabase Dashboard → Project Settings → API.
enum SupabaseConfig {
    static let url = URL(string: "https://your-project.supabase.co")!
    static let anonKey = "your-anon-key"

    /// Public URL for an image in the instagram-posts bucket.
    static func publicImageURL(storagePath: String) -> URL {
        let projectRef = url.host?.components(separatedBy: ".").first ?? "your-project"
        // Use Supabase image transformations to downscale on the fly so
        // WidgetKit never receives images that are too large to archive.
        // https://supabase.com/docs/guides/storage/image-transformations
        let encodedPath = storagePath.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? storagePath
        let base = "https://\(projectRef).supabase.co/storage/v1/render/image/public/instagram-posts/\(encodedPath)"
        return URL(string: "\(base)?width=800&quality=80")!
    }
}
