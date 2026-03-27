import CoreLocation
import Foundation
import SwiftUI
import WidgetKit

private enum SunSharedConfiguration {
    static let appGroupID = "group.com.aryapatel.glance1234"
    static let latitudeKey = "sun.latitude"
    static let longitudeKey = "sun.longitude"
    static let updatedAtKey = "sun.updatedAt"
}

private enum SunEventKind {
    case sunrise
    case sunset
}

private struct SolarData {
    let sunrise: Date
    let sunset: Date
    let sunriseAzimuth: Double
    let sunsetAzimuth: Double
    let nextEvent: SunEventKind

    var nextEventTime: Date {
        nextEvent == .sunrise ? sunrise : sunset
    }

    var nextAzimuth: Double {
        nextEvent == .sunrise ? sunriseAzimuth : sunsetAzimuth
    }

    var nextDirectionLabel: String {
        SunCalculator.compassDirection(for: nextAzimuth)
    }
}

private enum SunCalculator {
    static func solarData(for coordinate: CLLocationCoordinate2D, on date: Date) -> SolarData? {
        guard let sunrise = solarEventDate(for: coordinate, date: date, isSunrise: true),
              let sunset = solarEventDate(for: coordinate, date: date, isSunrise: false) else {
            return nil
        }

        let declination = solarDeclination(dayOfYear: dayOfYear(for: date))
        let sunriseAzimuth = azimuth(latitude: coordinate.latitude, declination: declination, isSunrise: true)
        let sunsetAzimuth = azimuth(latitude: coordinate.latitude, declination: declination, isSunrise: false)

        let nextEvent: SunEventKind
        if date < sunrise {
            nextEvent = .sunrise
        } else if date < sunset {
            nextEvent = .sunset
        } else {
            nextEvent = .sunrise
        }

        let adjustedSunrise = date < sunset ? sunrise : solarEventDate(for: coordinate, date: Calendar.current.date(byAdding: .day, value: 1, to: date) ?? date, isSunrise: true) ?? sunrise

        return SolarData(
            sunrise: adjustedSunrise,
            sunset: sunset,
            sunriseAzimuth: sunriseAzimuth,
            sunsetAzimuth: sunsetAzimuth,
            nextEvent: nextEvent
        )
    }

    static func compassDirection(for azimuth: Double) -> String {
        let directions = ["North", "Northeast", "East", "Southeast", "South", "Southwest", "West", "Northwest"]
        let normalized = normalizedDegrees(azimuth)
        let index = Int((normalized + 22.5) / 45.0) % directions.count
        return directions[index]
    }

    private static func solarEventDate(for coordinate: CLLocationCoordinate2D, date: Date, isSunrise: Bool) -> Date? {
        let day = Double(dayOfYear(for: date))
        let longitudeHour = coordinate.longitude / 15.0
        let approximateTime = day + ((isSunrise ? 6.0 : 18.0) - longitudeHour) / 24.0

        let meanAnomaly = (0.9856 * approximateTime) - 3.289
        var trueLongitude = meanAnomaly
            + (1.916 * sin(deg2rad(meanAnomaly)))
            + (0.020 * sin(2 * deg2rad(meanAnomaly)))
            + 282.634
        trueLongitude = normalizedDegrees(trueLongitude)

        var rightAscension = rad2deg(atan(0.91764 * tan(deg2rad(trueLongitude))))
        rightAscension = normalizedDegrees(rightAscension)

        let lQuadrant = floor(trueLongitude / 90.0) * 90.0
        let raQuadrant = floor(rightAscension / 90.0) * 90.0
        rightAscension = (rightAscension + (lQuadrant - raQuadrant)) / 15.0

        let sinDeclination = 0.39782 * sin(deg2rad(trueLongitude))
        let cosDeclination = cos(asin(sinDeclination))

        let zenith = 90.833
        let cosHourAngle = (
            cos(deg2rad(zenith))
            - (sinDeclination * sin(deg2rad(coordinate.latitude)))
        ) / (cosDeclination * cos(deg2rad(coordinate.latitude)))

        guard cosHourAngle >= -1.0, cosHourAngle <= 1.0 else {
            return nil
        }

        let localHourAngle = isSunrise
            ? 360.0 - rad2deg(acos(cosHourAngle))
            : rad2deg(acos(cosHourAngle))

        let hour = localHourAngle / 15.0
        let localMeanTime = hour + rightAscension - (0.06571 * approximateTime) - 6.622
        let utcHour = normalizedHours(localMeanTime - longitudeHour)

        let calendar = Calendar(identifier: .gregorian)
        var components = calendar.dateComponents(in: .gmt, from: date)
        components.hour = Int(utcHour)
        components.minute = Int((utcHour.truncatingRemainder(dividingBy: 1.0)) * 60.0)
        components.second = Int((((utcHour * 60.0).truncatingRemainder(dividingBy: 1.0)) * 60.0))

        guard let utcDate = calendar.date(from: components) else {
            return nil
        }

        return utcDate
    }

    private static func solarDeclination(dayOfYear: Int) -> Double {
        let gamma = 2.0 * Double.pi / 365.0 * (Double(dayOfYear) - 1.0)
        let declination = 0.006918
            - 0.399912 * cos(gamma)
            + 0.070257 * sin(gamma)
            - 0.006758 * cos(2.0 * gamma)
            + 0.000907 * sin(2.0 * gamma)
            - 0.002697 * cos(3.0 * gamma)
            + 0.00148 * sin(3.0 * gamma)
        return rad2deg(declination)
    }

    private static func azimuth(latitude: Double, declination: Double, isSunrise: Bool) -> Double {
        let cosAzimuth = min(1.0, max(-1.0, sin(deg2rad(declination)) / cos(deg2rad(latitude))))
        let base = rad2deg(acos(cosAzimuth))
        return isSunrise ? base : 360.0 - base
    }

    private static func dayOfYear(for date: Date) -> Int {
        Calendar(identifier: .gregorian).ordinality(of: .day, in: .year, for: date) ?? 1
    }

    private static func normalizedDegrees(_ value: Double) -> Double {
        var degrees = value.truncatingRemainder(dividingBy: 360.0)
        if degrees < 0 { degrees += 360.0 }
        return degrees
    }

    private static func normalizedHours(_ value: Double) -> Double {
        var hours = value.truncatingRemainder(dividingBy: 24.0)
        if hours < 0 { hours += 24.0 }
        return hours
    }

    private static func deg2rad(_ value: Double) -> Double {
        value * .pi / 180.0
    }

    private static func rad2deg(_ value: Double) -> Double {
        value * 180.0 / .pi
    }
}

private enum SunLocationStore {
    static func loadCoordinate() -> CLLocationCoordinate2D? {
        guard let defaults = UserDefaults(suiteName: SunSharedConfiguration.appGroupID),
              defaults.object(forKey: SunSharedConfiguration.latitudeKey) != nil,
              defaults.object(forKey: SunSharedConfiguration.longitudeKey) != nil else {
            return nil
        }

        return CLLocationCoordinate2D(
            latitude: defaults.double(forKey: SunSharedConfiguration.latitudeKey),
            longitude: defaults.double(forKey: SunSharedConfiguration.longitudeKey)
        )
    }
}

private struct SunWidgetEntry: TimelineEntry {
    let date: Date
    let solarData: SolarData?
}

private struct SunWidgetProvider: TimelineProvider {
    func placeholder(in context: Context) -> SunWidgetEntry {
        SunWidgetEntry(date: Date(), solarData: SunCalculator.solarData(for: CLLocationCoordinate2D(latitude: 37.7749, longitude: -122.4194), on: Date()))
    }

    func getSnapshot(in context: Context, completion: @escaping (SunWidgetEntry) -> Void) {
        let coordinate = SunLocationStore.loadCoordinate() ?? CLLocationCoordinate2D(latitude: 37.7749, longitude: -122.4194)
        completion(SunWidgetEntry(date: Date(), solarData: SunCalculator.solarData(for: coordinate, on: Date())))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SunWidgetEntry>) -> Void) {
        let now = Date()
        let entry = SunWidgetEntry(
            date: now,
            solarData: SunLocationStore.loadCoordinate().flatMap { SunCalculator.solarData(for: $0, on: now) }
        )

        let refreshDate: Date
        if let solarData = entry.solarData {
            let candidate = solarData.nextEventTime.addingTimeInterval(900)
            refreshDate = candidate > now ? candidate : now.addingTimeInterval(60 * 60 * 6)
        } else {
            refreshDate = now.addingTimeInterval(60 * 30)
        }

        completion(Timeline(entries: [entry], policy: .after(refreshDate)))
    }
}

private struct SunWidgetEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SunWidgetEntry

    var body: some View {
        ZStack {
            backgroundGradient

            if let solarData = entry.solarData {
                content(for: solarData)
            } else {
                emptyState
            }
        }
        .containerBackground(.clear, for: .widget)
    }

    private var backgroundGradient: some View {
        LinearGradient(
            colors: [Color(red: 0.09, green: 0.10, blue: 0.22), Color(red: 0.62, green: 0.34, blue: 0.26)],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    @ViewBuilder
    private func content(for solarData: SolarData) -> some View {
        if family == .systemMedium {
            HStack(spacing: 20) {
                eventSummary(for: solarData)
                Spacer(minLength: 0)
                eventList(for: solarData)
            }
            .padding(22)
        } else {
            smallContent(for: solarData)
        }
    }

    private func smallContent(for solarData: SolarData) -> some View {
        ZStack {
            smallBackground(for: solarData)

            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .top) {
                    Text(solarData.nextEvent == .sunrise ? "SUNRISE" : "SUNSET")
                        .font(.system(size: 10, weight: .bold, design: .rounded))
                        .tracking(1.1)
                        .foregroundStyle(.white.opacity(0.62))
                        .padding(.top, 4)

                    Spacer(minLength: 0)

                    Circle()
                        .fill(.white.opacity(0.14))
                        .frame(width: 38, height: 38)
                        .overlay {
                            Image(systemName: "location.north.fill")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundStyle(.white)
                                .rotationEffect(.degrees(solarData.nextAzimuth))
                        }
                }

                Spacer(minLength: 10)

                Text(solarData.nextEventTime.formatted(date: .omitted, time: .shortened))
                    .font(.system(size: 32, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)

                Spacer(minLength: 14)

                VStack(alignment: .leading, spacing: 4) {
                    Text("Look \(solarData.nextDirectionLabel)")
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .minimumScaleFactor(0.65)
                }

                Spacer(minLength: 0)

                Text("\(Int(solarData.nextAzimuth.rounded()))° bearing")
                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white.opacity(0.68))
                    .lineLimit(1)
                    .minimumScaleFactor(0.65)
            }
            .padding(16)
        }
    }

    private func eventSummary(for solarData: SolarData) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(solarData.nextEvent == .sunrise ? "Next sunrise" : "Next sunset")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.white.opacity(0.74))

            Text(solarData.nextEventTime.formatted(date: .omitted, time: .shortened))
                .font(.system(size: 32, weight: .bold, design: .rounded))
                .foregroundStyle(.white)

            Text("Look \(solarData.nextDirectionLabel)")
                .font(.title3.weight(.semibold))
                .foregroundStyle(.white.opacity(0.92))

            Image(systemName: "location.north.fill")
                .font(.system(size: 36))
                .foregroundStyle(.white)
                .rotationEffect(.degrees(solarData.nextAzimuth))
        }
    }

    private func eventList(for solarData: SolarData) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            eventRow(title: "Sunrise", time: solarData.sunrise, direction: SunCalculator.compassDirection(for: solarData.sunriseAzimuth))
            eventRow(title: "Sunset", time: solarData.sunset, direction: SunCalculator.compassDirection(for: solarData.sunsetAzimuth))
        }
    }

    private func eventRow(title: String, time: Date, direction: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title.uppercased())
                .font(.caption2.weight(.bold))
                .foregroundStyle(.white.opacity(0.62))

            Text(time.formatted(date: .omitted, time: .shortened))
                .font(.headline)
                .foregroundStyle(.white)

            Text(direction)
                .font(.caption)
                .foregroundStyle(.white.opacity(0.72))
        }
    }

    private func smallBackground(for solarData: SolarData) -> some View {
        ZStack {
            LinearGradient(
                colors: solarData.nextEvent == .sunrise
                    ? [Color(red: 0.11, green: 0.10, blue: 0.24), Color(red: 0.85, green: 0.43, blue: 0.28)]
                    : [Color(red: 0.08, green: 0.11, blue: 0.24), Color(red: 0.39, green: 0.19, blue: 0.39)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            Circle()
                .fill(
                    RadialGradient(
                        colors: solarData.nextEvent == .sunrise
                            ? [Color(red: 1.00, green: 0.75, blue: 0.51).opacity(0.65), .clear]
                            : [Color(red: 0.98, green: 0.48, blue: 0.35).opacity(0.50), .clear],
                        center: .center,
                        startRadius: 0,
                        endRadius: 84
                    )
                )
                .frame(width: 150, height: 150)
                .offset(x: 42, y: -46)

            RoundedRectangle(cornerRadius: 999, style: .continuous)
                .fill(.white.opacity(0.07))
                .frame(height: 1)
                .offset(y: 8)
                .padding(.horizontal, 18)
        }
    }

    private var emptyState: some View {
        ZStack {
            LinearGradient(
                colors: [Color(red: 0.10, green: 0.11, blue: 0.20), Color(red: 0.24, green: 0.24, blue: 0.34)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            VStack(spacing: 10) {
                Circle()
                    .fill(.white.opacity(0.10))
                    .frame(width: 54, height: 54)
                    .overlay {
                        Image(systemName: "sun.haze.fill")
                            .font(.system(size: 22))
                            .foregroundStyle(.white.opacity(0.92))
                    }

                Text("Sun Path")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(.white)

                Text("Open Glance and save your location.")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.72))
                    .multilineTextAlignment(.center)
            }
            .padding(18)
        }
    }
}

struct SunWidget: Widget {
    static let kind = "SunWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Self.kind, provider: SunWidgetProvider()) { entry in
            SunWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Sun Path")
        .description("Shows the next sunrise or sunset and the direction to look.")
        .supportedFamilies([.systemSmall, .systemMedium])
        .contentMarginsDisabled()
    }
}

#Preview(as: .systemSmall) {
    SunWidget()
} timeline: {
    SunWidgetEntry(
        date: Date(),
        solarData: SunCalculator.solarData(for: CLLocationCoordinate2D(latitude: 37.7749, longitude: -122.4194), on: Date())
    )
}
