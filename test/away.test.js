'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { createAwayManager } = require('../src/main/awayManager.js');

// 헬퍼: 기본 옵션으로 awayManager 생성
function makeManager(overrides = {}) {
  const calls = [];
  const defaults = {
    getSettings: () => ({ ntfyTopic: 'test', awayThresholdMin: 10, cameraEnabled: false }),
    getIdleTimeSec: () => 0,
    getFacePresent: () => true,
    isManualBreak: () => false,
    sendPhone: async (msg, settings) => { calls.push({ msg, settings }); },
    pollIntervalMs: 60000, // 실제 타이머 사용 안 함 (start 호출 안 함)
  };
  const mgr = createAwayManager({ ...defaults, ...overrides });
  return { mgr, calls };
}

describe('awayManager — away 판정', () => {
  it('idle 30초 미만 + 카메라 꺼짐 → not away', async () => {
    const { mgr } = makeManager({ getIdleTimeSec: () => 10 });
    await mgr._tickForTest(5);
    assert.equal(mgr._getState().awaySec, 0);
  });

  it('idle >= 30초 → away 누적', async () => {
    const { mgr } = makeManager({ getIdleTimeSec: () => 30 });
    await mgr._tickForTest(5);
    assert.ok(mgr._getState().awaySec > 0);
  });

  it('카메라 켜짐 + facePresent=false → away 누적', async () => {
    const { mgr } = makeManager({
      getIdleTimeSec: () => 0,
      getFacePresent: () => false,
      getSettings: () => ({ ntfyTopic: 'test', awayThresholdMin: 10, cameraEnabled: true }),
    });
    await mgr._tickForTest(5);
    assert.ok(mgr._getState().awaySec > 0);
  });

  it('카메라 켜짐 + facePresent=true → not away', async () => {
    const { mgr } = makeManager({
      getIdleTimeSec: () => 0,
      getFacePresent: () => true,
      getSettings: () => ({ ntfyTopic: 'test', awayThresholdMin: 10, cameraEnabled: true }),
    });
    await mgr._tickForTest(5);
    assert.equal(mgr._getState().awaySec, 0);
  });
});

describe('awayManager — 임계값 초과 → 알림 1회', () => {
  it('AWAY_NOTIFY_SEC 환경변수로 임계값 단축 → 초과 시 sendPhone 호출', async () => {
    const origEnv = process.env.AWAY_NOTIFY_SEC;
    process.env.AWAY_NOTIFY_SEC = '10'; // 10초

    const { mgr, calls } = makeManager({ getIdleTimeSec: () => 30 });

    // 5초씩 3번 tick → 누적 15초 (10초 임계값 초과)
    await mgr._tickForTest(5);
    await mgr._tickForTest(5);
    await mgr._tickForTest(5);

    assert.equal(calls.length, 1, '알림 1회만 발생해야 함');
    assert.ok(calls[0].msg.includes('자리'));

    // 한 번 더 tick해도 추가 알림 없음
    await mgr._tickForTest(5);
    assert.equal(calls.length, 1, '임계값 초과 후 추가 알림 없어야 함');

    process.env.AWAY_NOTIFY_SEC = origEnv === undefined ? '' : origEnv;
    if (origEnv === undefined) delete process.env.AWAY_NOTIFY_SEC;
  });

  it('복귀 후 다시 자리비움 → 두 번째 알림 발생', async () => {
    const origEnv = process.env.AWAY_NOTIFY_SEC;
    process.env.AWAY_NOTIFY_SEC = '5'; // 5초

    let idleTime = 30;
    const { mgr, calls } = makeManager({ getIdleTimeSec: () => idleTime });

    // 첫 번째 away + 임계값 초과
    await mgr._tickForTest(6);
    assert.equal(calls.length, 1);

    // 복귀 (idle 0)
    idleTime = 0;
    await mgr._tickForTest(1);
    assert.equal(mgr._getState().awaySec, 0, '복귀 시 awaySec 리셋');
    assert.equal(mgr._getState().alertFired, false, '복귀 시 alertFired 리셋');

    // 두 번째 away + 임계값 초과
    idleTime = 30;
    await mgr._tickForTest(6);
    assert.equal(calls.length, 2, '두 번째 알림 발생해야 함');

    process.env.AWAY_NOTIFY_SEC = origEnv === undefined ? '' : origEnv;
    if (origEnv === undefined) delete process.env.AWAY_NOTIFY_SEC;
  });
});

describe('awayManager — manualBreak 억제', () => {
  it('manualBreak=true이면 임계값 초과해도 sendPhone 미호출', async () => {
    const origEnv = process.env.AWAY_NOTIFY_SEC;
    process.env.AWAY_NOTIFY_SEC = '5';

    const { mgr, calls } = makeManager({
      getIdleTimeSec: () => 30,
      isManualBreak: () => true,
    });

    await mgr._tickForTest(6); // 임계값(5초) 초과
    assert.equal(calls.length, 0, 'manualBreak=true → 알림 억제');

    process.env.AWAY_NOTIFY_SEC = origEnv === undefined ? '' : origEnv;
    if (origEnv === undefined) delete process.env.AWAY_NOTIFY_SEC;
  });
});
