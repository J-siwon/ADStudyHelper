import XCTest
@testable import ADStudyHelperPhone

final class RestScheduleEvaluatorTests: XCTestCase {
    private var calendar: Calendar {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0)!
        return calendar
    }

    func testRegularScheduleIncludesStartButExcludesEnd() throws {
        let schedule = RestSchedule(
            id: "lunch",
            name: "점심",
            enabled: true,
            days: [4],
            start: "12:00",
            end: "13:00"
        )
        let start = try XCTUnwrap(calendar.date(from: DateComponents(
            year: 2026, month: 8, day: 27, hour: 12, minute: 0
        )))
        let end = try XCTUnwrap(calendar.date(from: DateComponents(
            year: 2026, month: 8, day: 27, hour: 13, minute: 0
        )))
        XCTAssertTrue(RestScheduleEvaluator.contains(schedule, date: start, calendar: calendar))
        XCTAssertFalse(RestScheduleEvaluator.contains(schedule, date: end, calendar: calendar))
    }

    func testOvernightScheduleIncludesFollowingMorning() throws {
        let schedule = RestSchedule(
            id: "night",
            name: "밤",
            enabled: true,
            days: [4],
            start: "23:00",
            end: "01:00"
        )
        let followingMorning = try XCTUnwrap(calendar.date(from: DateComponents(
            year: 2026, month: 8, day: 28, hour: 0, minute: 30
        )))
        XCTAssertTrue(RestScheduleEvaluator.contains(
            schedule,
            date: followingMorning,
            calendar: calendar
        ))
    }

    func testDetectionModeUsesDesktopWireValues() throws {
        let encoded = try JSONEncoder().encode(DetectionMode.screenOn)
        XCTAssertEqual(String(decoding: encoded, as: UTF8.self), "\"screen_on\"")
        XCTAssertEqual(try JSONDecoder().decode(DetectionMode.self, from: encoded), .screenOn)
    }
}
