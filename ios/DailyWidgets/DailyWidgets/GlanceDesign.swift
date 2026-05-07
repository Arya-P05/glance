import SwiftUI

enum GlanceDesign {
    enum ColorToken {
        static let background = Color.black
        static let success = Color(red: 0.42, green: 0.9, blue: 0.58)
        static let warning = Color(red: 1.0, green: 0.58, blue: 0.38)
    }

    enum Opacity {
        static let primary = 0.9
        static let secondary = 0.68
        static let action = 0.52
        static let separator = 0.35
        static let disabled = 0.22
        static let quiet = 0.44
    }

    enum Radius {
        static let photo: CGFloat = 16
        static let thumb: CGFloat = 10
    }

    enum Spacing {
        static let screenHorizontal: CGFloat = 28
        static let sheetHorizontal: CGFloat = 24
    }

    enum FontToken {
        static let action = Font.system(size: 16, weight: .regular)
        static let body = Font.system(size: 15, weight: .regular)
        static let meta = Font.system(size: 13, weight: .regular)
        static let sheetTitle = Font.system(size: 20, weight: .semibold)
    }
}
