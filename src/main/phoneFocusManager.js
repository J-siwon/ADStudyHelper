'use strict';

const { EventEmitter } = require('events');

const DETECTION_MODES = new Set(['screen_on', 'actual_use']);
const EVENT_TYPES = new Set(['screen_on', 'actual_use']);
const MAX_SEEN_EVENTS = 500;

function clampNumber(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeTime(value, fallback) {
  if (typeof value !== 'string' || !/^\d{2}:\d{2}$/.test(value)) return fallback;
  const [hour, minute] = value.split(':').map(Number);
  if (hour > 23 || minute > 59) return fallback;
  return value;
}

function normalizeRestSchedule(schedule, index = 0) {
  const rawDays = Array.isArray(schedule && schedule.days) ? schedule.days : [];
  const days = [...new Set(rawDays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
    .sort((a, b) => a - b);

  return {
    id: String((schedule && schedule.id) || `schedule-${index + 1}`).slice(0, 80),
    name: String((schedule && schedule.name) || '쉬는 시간').slice(0, 80),
    enabled: !schedule || schedule.enabled !== false,
    days,
    start: normalizeTime(schedule && schedule.start, '12:00'),
    end: normalizeTime(schedule && schedule.end, '13:00'),
  };
}

function normalizePhoneConfig(settings = {}) {
  const schedules = Array.isArray(settings.phoneRestSchedules)
    ? settings.phoneRestSchedules.slice(0, 32).map(normalizeRestSchedule)
    : [];

  return {
    enabled: settings.phoneIntegrationEnabled === true,
    detectionMode: DETECTION_MODES.has(settings.phoneDetectionMode)
      ? settings.phoneDetectionMode
      : 'actual_use',
    breakDurationSec: Math.round(clampNumber(settings.phoneBreakDurationSec, 5, 3600, 60)),
    actualUseThresholdSec: Math.round(clampNumber(settings.phoneActualUseThresholdSec, 1, 3600, 60)),
    alertMessage: String(settings.phoneAlertMessage || '집중해라!!!').slice(0, 200),
    restSchedules: schedules,
  };
}

function timeToMinutes(value) {
  const [hour, minute] = value.split(':').map(Number);
  return (hour * 60) + minute;
}

function scheduleContainsDate(schedule, date) {
  if (!schedule.enabled || schedule.days.length === 0) return false;

  const nowMinutes = (date.getHours() * 60) + date.getMinutes();
  const startMinutes = timeToMinutes(schedule.start);
  const endMinutes = timeToMinutes(schedule.end);
  const today = date.getDay();

  if (startMinutes === endMinutes) {
    return schedule.days.includes(today);
  }

  if (startMinutes < endMinutes) {
    return schedule.days.includes(today)
      && nowMinutes >= startMinutes
      && nowMinutes < endMinutes;
  }

  // 자정을 넘기는 일정. 시작 요일의 늦은 구간 또는 전날 일정의 이른 구간에 포함된다.
  const previousDay = (today + 6) % 7;
  return (schedule.days.includes(today) && nowMinutes >= startMinutes)
    || (schedule.days.includes(previousDay) && nowMinutes < endMinutes);
}

function findActiveSchedule(restSchedules, date = new Date()) {
  for (const schedule of restSchedules) {
    if (scheduleContainsDate(schedule, date)) return schedule;
  }
  return null;
}

function createPhoneFocusManager({
  getSettings,
  now = () => new Date(),
  pollIntervalMs = 1000,
} = {}) {
  if (typeof getSettings !== 'function') {
    throw new TypeError('getSettings must be a function');
  }

  const events = new EventEmitter();
  const seenEventIds = new Map();
  let intervalId = null;
  let activityBreakUntilMs = 0;
  let lastEvent = null;
  let lastSignature = '';

  function getConfig() {
    return normalizePhoneConfig(getSettings());
  }

  function getStatus() {
    const currentDate = now();
    const nowMs = currentDate.getTime();
    const config = getConfig();
    const activeSchedule = config.enabled
      ? findActiveSchedule(config.restSchedules, currentDate)
      : null;
    const activityBreak = config.enabled && activityBreakUntilMs > nowMs;
    const scheduledBreak = !!activeSchedule;

    return {
      enabled: config.enabled,
      isBreak: scheduledBreak || activityBreak,
      scheduledBreak,
      activityBreak,
      source: scheduledBreak ? 'scheduled' : (activityBreak ? 'phone_activity' : null),
      activeSchedule,
      breakUntil: activityBreak ? new Date(activityBreakUntilMs).toISOString() : null,
      lastEvent,
    };
  }

  function emitIfChanged(force = false) {
    const status = getStatus();
    const signature = JSON.stringify({
      enabled: status.enabled,
      isBreak: status.isBreak,
      source: status.source,
      scheduleId: status.activeSchedule && status.activeSchedule.id,
      breakUntil: status.breakUntil,
    });
    if (force || signature !== lastSignature) {
      lastSignature = signature;
      events.emit('change', status);
    }
    return status;
  }

  function rememberEvent(eventId, atMs) {
    seenEventIds.set(eventId, atMs);
    while (seenEventIds.size > MAX_SEEN_EVENTS) {
      seenEventIds.delete(seenEventIds.keys().next().value);
    }
  }

  function receiveEvent(payload = {}) {
    const config = getConfig();
    if (!config.enabled) {
      return { accepted: false, reason: 'disabled', shouldNotify: false, status: getStatus() };
    }

    const type = String(payload.type || '');
    if (!EVENT_TYPES.has(type)) {
      return { accepted: false, reason: 'invalid_event_type', shouldNotify: false, status: getStatus() };
    }
    if (type !== config.detectionMode) {
      return { accepted: false, reason: 'stale_detection_mode', shouldNotify: false, status: getStatus() };
    }

    const eventId = String(payload.eventId || '').slice(0, 160);
    if (!eventId) {
      return { accepted: false, reason: 'missing_event_id', shouldNotify: false, status: getStatus() };
    }
    if (seenEventIds.has(eventId)) {
      return { accepted: true, duplicate: true, shouldNotify: false, status: getStatus() };
    }

    const currentDate = now();
    const nowMs = currentDate.getTime();
    rememberEvent(eventId, nowMs);
    const activeSchedule = findActiveSchedule(config.restSchedules, currentDate);
    // 예약 휴식 중 발생한 사용은 예약 종료 뒤까지 활동 BREAK를 끌고 가지 않는다.
    if (!activeSchedule) {
      activityBreakUntilMs = Math.max(activityBreakUntilMs, nowMs + (config.breakDurationSec * 1000));
    }
    lastEvent = {
      eventId,
      type,
      deviceId: String(payload.deviceId || 'unknown').slice(0, 160),
      sessionId: String(payload.sessionId || 'unknown').slice(0, 160),
      detectedAt: String(payload.detectedAt || currentDate.toISOString()).slice(0, 80),
      receivedAt: currentDate.toISOString(),
    };

    const status = emitIfChanged(true);
    return {
      accepted: true,
      duplicate: false,
      shouldNotify: !status.scheduledBreak,
      alertMessage: status.scheduledBreak ? null : config.alertMessage,
      status,
    };
  }

  function clearActivityBreak() {
    activityBreakUntilMs = 0;
    return emitIfChanged(true);
  }

  function start() {
    if (intervalId) return;
    lastSignature = '';
    emitIfChanged(true);
    intervalId = setInterval(() => emitIfChanged(false), pollIntervalMs);
  }

  function stop() {
    if (!intervalId) return;
    clearInterval(intervalId);
    intervalId = null;
  }

  return {
    start,
    stop,
    refresh: () => emitIfChanged(true),
    onChange: (listener) => events.on('change', listener),
    getConfig,
    getStatus,
    receiveEvent,
    clearActivityBreak,
  };
}

module.exports = {
  createPhoneFocusManager,
  normalizePhoneConfig,
  normalizeRestSchedule,
  scheduleContainsDate,
  findActiveSchedule,
};
