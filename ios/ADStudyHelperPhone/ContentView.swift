import FamilyControls
import SwiftUI

struct ContentView: View {
    @StateObject private var model = FocusIntegrationModel()
    @State private var showActivityPicker = false

    var body: some View {
        NavigationStack {
            Form {
                connectionSection
                permissionSection
                detectionSection
                scheduleSection
                actionSection
            }
            .navigationTitle("ADStudyHelper")
            .familyActivityPicker(
                isPresented: $showActivityPicker,
                selection: $model.selection
            )
            .task { await model.flushPendingEvents() }
        }
    }

    private var connectionSection: some View {
        Section("데스크톱 연결") {
            TextField("http://192.168.x.x:47616", text: $model.serverURL)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .keyboardType(.URL)
            SecureField("페어링 토큰", text: $model.pairingToken)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            Button("연결 확인 및 PC 설정 가져오기") {
                Task { await model.connectAndPull() }
            }
            .disabled(model.isBusy)
            Text("PC 설정 화면에 표시되는 서버 주소와 토큰을 그대로 입력하세요. iPhone과 PC는 같은 Wi-Fi에 있어야 합니다.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }

    private var permissionSection: some View {
        Section("권한") {
            LabeledContent("Screen Time", value: model.authorizationText)
            Button("Screen Time 및 알림 권한 요청") {
                Task { await model.requestPermissions() }
            }
            .disabled(model.isBusy)
        }
    }

    private var detectionSection: some View {
        Section("휴대폰 감지") {
            Toggle("iPhone 연동", isOn: $model.configuration.enabled)

            Picker("감지 방식", selection: $model.configuration.detectionMode) {
                ForEach(DetectionMode.allCases) { mode in
                    Text(mode.title).tag(mode)
                }
            }

            if model.configuration.detectionMode == .screenOn {
                Text("iOS는 화면 켜짐/잠금 해제 이벤트를 앱에 공개하지 않습니다. 이 모드는 모든 앱의 화면 전면 사용을 약 1초 임계로 감지하는 가장 가까운 근사 방식입니다.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                Stepper(
                    "감지 기준: \(model.configuration.actualUseThresholdSec)초",
                    value: $model.configuration.actualUseThresholdSec,
                    in: 1...3_600,
                    step: 15
                )
                Button("쉬는 시간으로 처리할 앱 선택") {
                    showActivityPicker = true
                }
                Text("선택하지 않은 앱은 집중 중 허용됩니다. 아래 예약 휴식 중에는 선택하지 않은 허용 앱을 사용해도 PC 상태는 BREAK입니다.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Stepper(
                "감지 후 BREAK: \(model.configuration.breakDurationSec)초",
                value: $model.configuration.breakDurationSec,
                in: 5...3_600,
                step: 5
            )
            TextField("알림 문구", text: $model.configuration.alertMessage)
        }
    }

    private var scheduleSection: some View {
        Section {
            ForEach($model.configuration.restSchedules) { $schedule in
                ScheduleEditor(schedule: $schedule)
            }
            .onDelete(perform: model.removeSchedules)

            Button("예약 휴식 추가", action: model.addSchedule)
        } header: {
            Text("예약 휴식")
        } footer: {
            Text("예약 시간에는 PC의 허용 앱보다 휴식이 우선하고, ‘집중해라!!!’ 알림은 발생하지 않습니다. 자정을 넘기는 시간도 지원합니다.")
        }
    }

    private var actionSection: some View {
        Section {
            Button(model.isBusy ? "처리 중…" : "저장·동기화·감지 시작") {
                Task { await model.saveAndStart() }
            }
            .disabled(model.isBusy)

            if !model.statusMessage.isEmpty {
                Text(model.statusMessage)
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
    }
}
private struct ScheduleEditor: View {
    @Binding var schedule: RestSchedule
    private let dayNames = ["일", "월", "화", "수", "목", "금", "토"]

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Toggle(isOn: $schedule.enabled) {
                TextField("이름", text: $schedule.name)
            }

            HStack {
                DatePicker("시작", selection: timeBinding(for: $schedule.start), displayedComponents: .hourAndMinute)
                DatePicker("종료", selection: timeBinding(for: $schedule.end), displayedComponents: .hourAndMinute)
            }
            .labelsHidden()

            HStack(spacing: 6) {
                ForEach(0..<7, id: \.self) { day in
                    Button(dayNames[day]) { toggle(day) }
                        .buttonStyle(.bordered)
                        .tint(schedule.days.contains(day) ? .orange : .gray)
                        .accessibilityLabel("\(dayNames[day])요일")
                }
            }
        }
        .padding(.vertical, 4)
    }

    private func toggle(_ day: Int) {
        if let index = schedule.days.firstIndex(of: day) {
            schedule.days.remove(at: index)
        } else {
            schedule.days.append(day)
            schedule.days.sort()
        }
    }

    private func timeBinding(for value: Binding<String>) -> Binding<Date> {
        Binding(
            get: { Self.date(from: value.wrappedValue) },
            set: { value.wrappedValue = Self.string(from: $0) }
        )
    }

    private static func date(from value: String) -> Date {
        let parts = value.split(separator: ":").compactMap { Int($0) }
        let hour = parts.count > 0 ? parts[0] : 12
        let minute = parts.count > 1 ? parts[1] : 0
        return Calendar.current.date(bySettingHour: hour, minute: minute, second: 0, of: Date()) ?? Date()
    }

    private static func string(from date: Date) -> String {
        let components = Calendar.current.dateComponents([.hour, .minute], from: date)
        return String(format: "%02d:%02d", components.hour ?? 0, components.minute ?? 0)
    }
}
