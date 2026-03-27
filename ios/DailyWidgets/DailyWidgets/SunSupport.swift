import CoreLocation
import Foundation
import WidgetKit

enum SharedSunConfiguration {
    static let appGroupID = "group.com.aryapatel.glance1234"
    static let latitudeKey = "sun.latitude"
    static let longitudeKey = "sun.longitude"
    static let updatedAtKey = "sun.updatedAt"
    static let photoWidgetKind = "DailyWidgetExtension"
    static let sunWidgetKind = "SunWidget"
}

enum SunEventKind {
    case sunrise
    case sunset
}

struct SolarData {
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

enum SunCalculator {
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

enum SunLocationStore {
    struct StoredLocation {
        let latitude: Double
        let longitude: Double
        let updatedAt: Date

        var coordinate: CLLocationCoordinate2D {
            CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
        }
    }

    static func load() -> StoredLocation? {
        guard let defaults = UserDefaults(suiteName: SharedSunConfiguration.appGroupID),
              defaults.object(forKey: SharedSunConfiguration.latitudeKey) != nil,
              defaults.object(forKey: SharedSunConfiguration.longitudeKey) != nil,
              let updatedAt = defaults.object(forKey: SharedSunConfiguration.updatedAtKey) as? Date else {
            return nil
        }

        return StoredLocation(
            latitude: defaults.double(forKey: SharedSunConfiguration.latitudeKey),
            longitude: defaults.double(forKey: SharedSunConfiguration.longitudeKey),
            updatedAt: updatedAt
        )
    }

    static func save(location: CLLocation) {
        guard let defaults = UserDefaults(suiteName: SharedSunConfiguration.appGroupID) else {
            return
        }

        defaults.set(location.coordinate.latitude, forKey: SharedSunConfiguration.latitudeKey)
        defaults.set(location.coordinate.longitude, forKey: SharedSunConfiguration.longitudeKey)
        defaults.set(Date(), forKey: SharedSunConfiguration.updatedAtKey)
    }
}

final class SunLocationManager: NSObject, ObservableObject, CLLocationManagerDelegate {
    @Published var lastLocation: SunLocationStore.StoredLocation?
    @Published var errorMessage: String?
    @Published var lastUpdated: Date?

    private let manager = CLLocationManager()

    override init() {
        let storedLocation = SunLocationStore.load()
        self.lastLocation = storedLocation
        self.lastUpdated = storedLocation?.updatedAt
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    func requestCurrentLocation() {
        errorMessage = nil

        switch manager.authorizationStatus {
        case .notDetermined:
            manager.requestWhenInUseAuthorization()
        case .restricted, .denied:
            errorMessage = "Location access is off. Enable it in Settings to power the sun widget."
        case .authorizedWhenInUse, .authorizedAlways:
            manager.requestLocation()
        @unknown default:
            errorMessage = "Location access is unavailable right now."
        }
    }

    func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        if manager.authorizationStatus == .authorizedAlways || manager.authorizationStatus == .authorizedWhenInUse {
            manager.requestLocation()
        }
    }

    func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.first else { return }
        SunLocationStore.save(location: location)
        let storedLocation = SunLocationStore.load()
        lastLocation = storedLocation
        lastUpdated = storedLocation?.updatedAt
        WidgetCenter.shared.reloadTimelines(ofKind: SharedSunConfiguration.sunWidgetKind)
    }

    func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        errorMessage = "Couldn't fetch your location just now. Try again in a moment."
    }
}
