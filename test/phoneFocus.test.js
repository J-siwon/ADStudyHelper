'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  createPhoneFocusManager,
  normalizePhoneConfig,
  scheduleContainsDate,
} = require('../src/main/phoneFocusManager');

function baseSettings(overrides = {}) {
  return {
    phoneIntegrationEnabled: true,
    phoneDetectionMode: 'actual_use',
    phoneBreakDurationSec: 60,
    phoneActualUseThresholdSec: 60,
    phoneAlertMessage: '집중해라!!!',
    phoneRestSchedules: [],
    ...overrides,
  };
}

function phoneEvent(overrides = {}) {
  return {
    eventId: 'event-1',
    type: 'actual_use',
    deviceId: 'iphone-1',
    sessionId: 'phone-session-1',
    detectedAt: '2026-08-27T09:00:00.000Z',
    ...overrides,
  };
}

describe('phoneFocusManager 설정과 예약 휴식', () => {
  it('설정값을 안전한 범위로 정규화한다', () => {
    const config = normalizePhoneConfig(baseSettings({
      phoneDetectionMode: 'unknown',
      phoneBreakDurationSec: 0,
      phoneActualUseThresholdSec: 99999,
    }));
    assert.equal(config.detectionMode, 'actual_use');
    assert.equal(config.breakDurationSec, 5);
    assert.equal(config.actualUseThresholdSec, 3600);
  });

  it('자정을 넘기는 예약 휴식을 시작 요일과 다음 날에 모두 판정한다', () => {
    const schedule = {
      id: 'night', name: '밤 휴식', enabled: true, days: [4], start: '23:00', end: '01:00',
    };
    assert.equal(scheduleContainsDate(schedule, new Date(2026, 7, 27, 23, 30)), true); // 목요일
    assert.equal(scheduleContainsDate(schedule, new Date(2026, 7, 28, 0, 30)), true);  // 금요일 새벽
    assert.equal(scheduleContainsDate(schedule, new Date(2026, 7, 28, 1, 0)), false);
  });

  it('예약 휴식은 휴대폰 이벤트가 없어도 BREAK이며 허용 앱 여부와 무관하다', () => {
    let current = new Date(2026, 7, 27, 12, 30);
    const manager = createPhoneFocusManager({
      now: () => current,
      getSettings: () => baseSettings({
        phoneRestSchedules: [
          { id: 'lunch', name: '점심', enabled: true, days: [4], start: '12:00', end: '13:00' },
        ],
      }),
    });
    assert.equal(manager.getStatus().isBreak, true);
    assert.equal(manager.getStatus().source, 'scheduled');

    current = new Date(2026, 7, 27, 13, 0);
    assert.equal(manager.getStatus().isBreak, false);
  });
});

describe('phoneFocusManager 이벤트 격리와 수명', () => {
  it('휴대폰 이벤트가 설정 시간 동안 BREAK를 만들고 별도 세션 ID를 보존한다', () => {
    let nowMs = Date.parse('2026-08-27T09:00:00.000Z');
    const manager = createPhoneFocusManager({
      now: () => new Date(nowMs),
      getSettings: () => baseSettings({ phoneBreakDurationSec: 30 }),
    });

    const result = manager.receiveEvent(phoneEvent());
    assert.equal(result.accepted, true);
    assert.equal(result.shouldNotify, true);
    assert.equal(manager.getStatus().isBreak, true);
    assert.equal(manager.getStatus().lastEvent.sessionId, 'phone-session-1');

    nowMs += 30_000;
    assert.equal(manager.getStatus().isBreak, false);
  });

  it('중복 eventId는 BREAK를 연장하거나 알림을 반복하지 않는다', () => {
    let nowMs = Date.parse('2026-08-27T09:00:00.000Z');
    const manager = createPhoneFocusManager({
      now: () => new Date(nowMs),
      getSettings: () => baseSettings({ phoneBreakDurationSec: 30 }),
    });
    manager.receiveEvent(phoneEvent());
    nowMs += 20_000;
    const duplicate = manager.receiveEvent(phoneEvent());
    assert.equal(duplicate.duplicate, true);
    assert.equal(duplicate.shouldNotify, false);
    nowMs += 10_000;
    assert.equal(manager.getStatus().isBreak, false);
  });

  it('현재 선택과 다른 감지 모드 이벤트는 오래된 설정으로 보고 거부한다', () => {
    const manager = createPhoneFocusManager({
      now: () => new Date('2026-08-27T09:00:00.000Z'),
      getSettings: () => baseSettings({ phoneDetectionMode: 'screen_on' }),
    });
    const result = manager.receiveEvent(phoneEvent());
    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'stale_detection_mode');
  });

  it('예약 휴식 중 이벤트는 알림과 예약 종료 뒤 BREAK 연장을 만들지 않는다', () => {
    let current = new Date(2026, 7, 27, 12, 59, 30);
    const manager = createPhoneFocusManager({
      now: () => current,
      getSettings: () => baseSettings({
        phoneRestSchedules: [
          { id: 'lunch', name: '점심', enabled: true, days: [4], start: '12:00', end: '13:00' },
        ],
      }),
    });
    const result = manager.receiveEvent(phoneEvent());
    assert.equal(result.accepted, true);
    assert.equal(result.shouldNotify, false);

    current = new Date(2026, 7, 27, 13, 0, 0);
    assert.equal(manager.getStatus().isBreak, false);
  });
});
