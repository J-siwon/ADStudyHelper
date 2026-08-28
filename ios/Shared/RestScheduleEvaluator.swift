import Foundation

enum RestScheduleEvaluator {
    static func activeSchedule(
        in schedules: [RestSchedule],
        at date: Date = Date(),
        calendar: Calendar = .current
    ) -> RestSchedule? {
        schedules.first { contains($0, date: date, calendar: calendar) }
    }

    static func contains(_ schedule: RestSchedule, date: Date, calendar: Calendar = .current) -> Bool {
        guard schedule.enabled, !schedule.days.isEmpty,
              let start = minutes(schedule.start),
              let end = minutes(schedule.end) else { return false }

        let components = calendar.dateComponents([.weekday, .hour, .minute], from: date)
        guard let weekday = components.weekday,
              let hour = components.hour,
              let minute = components.minute else { return false }

        let today = weekday - 1
        let now = (hour * 60) + minute

        if start == end {
            return schedule.days.contains(today)
        }
        if start < end {
            return schedule.days.contains(today) && now >= start && now < end
        }

        let previousDay = (today + 6) % 7
        return (schedule.days.contains(today) && now >= start)
            || (schedule.days.contains(previousDay) && now < end)
    }

    private static func minutes(_ value: String) -> Int? {
        let parts = value.split(separator: ":")
        guard parts.count == 2,
              let hour = Int(parts[0]), hour >= 0, hour <= 23,
              let minute = Int(parts[1]), minute >= 0, minute <= 59 else { return nil }
        return (hour * 60) + minute
    }
}
