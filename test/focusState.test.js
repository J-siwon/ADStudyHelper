'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const FocusState = require('../src/main/focusState.js');

// 헬퍼: ms 대기
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 헬퍼: 이벤트를 Promise로 래핑 (타임아웃 포함)
function waitForEvent(emitter, event, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`이벤트 '${event}' 타임아웃 (${timeoutMs}ms)`));
    }, timeoutMs);
    emitter.once(event, (arg) => {
      clearTimeout(timer);
      resolve(arg);
    });
  });
}

describe('FocusState — 기본 동작', () => {
  let fs;

  beforeEach(() => {
    fs = new FocusState({ breakThresholdSec: 3 });
  });

  afterEach(() => {
    fs.stop();
  });

  it('초기 getWorkSeconds()는 0', () => {
    assert.equal(fs.getWorkSeconds(), 0);
  });

  it('getState()는 현재 상태를 반환 (초기 BREAK)', () => {
    assert.equal(fs.getState(), 'BREAK');
    fs.setState('WORK');
    assert.equal(fs.getState(), 'WORK');
  });

  it('setState("WORK") 후 stateChange 이벤트 발생', async () => {
    const p = waitForEvent(fs, 'stateChange');
    fs.setState('WORK');
    const state = await p;
    assert.equal(state, 'WORK');
  });

  it('같은 상태로 setState 시 stateChange 미발생', () => {
    let count = 0;
    fs.on('stateChange', () => count++);
    // 초기 상태가 BREAK이므로 BREAK로 다시 설정해도 이벤트 없음
    fs.setState('BREAK');
    assert.equal(count, 0);
  });

  it('WORK 복귀해도 breakSeconds는 즉시 초기화되지 않는다 (누적 유지)', () => {
    fs.setState('WORK');
    fs.setState('BREAK');
    fs._breakSeconds = 5;
    fs.setState('WORK');
    // 즉시 초기화하지 않음 — 연속 집중 유지 시에만 초기화됨
    assert.equal(fs._breakSeconds, 5);
  });

  it('BREAK 진입 시 연속 집중 카운터(contWorkSeconds)는 0으로 리셋', () => {
    fs.setState('WORK');
    fs._contWorkSeconds = 42;
    fs.setState('BREAK');
    assert.equal(fs._contWorkSeconds, 0);
  });
});

describe('FocusState — tick 타이머', () => {
  it('사용자가 지정한 휴식 중에는 breakAlert를 보류하고 해제 뒤 발생시킨다', async () => {
    const fs = new FocusState({ breakThresholdSec: 1 });
    let alertCount = 0;
    fs.on('breakAlert', () => alertCount++);
    fs.setBreakAlertSuppressed(true);
    fs.start();
    await wait(1200);
    assert.equal(alertCount, 0);
    fs.setBreakAlertSuppressed(false);
    await wait(1100);
    fs.stop();
    assert.equal(alertCount, 1);
  });

  it('WORK 상태에서 tick 후 getWorkSeconds 증가', async () => {
    const fs = new FocusState({ breakThresholdSec: 600 });
    fs.setState('WORK');
    fs.start();
    const tick = await waitForEvent(fs, 'tick');
    fs.stop();
    assert.equal(tick.workSeconds, 1);
  });

  it('BREAK 상태에서 tick은 breakSeconds를 실어 보낸다', async () => {
    const fs = new FocusState({ breakThresholdSec: 600 });
    fs.setState('BREAK');
    fs.start();
    const tick = await waitForEvent(fs, 'tick');
    fs.stop();
    assert.equal(tick.state, 'BREAK');
    assert.equal(tick.breakSeconds, 1);
  });

  it('BREAK 임계값 초과 시 breakAlert 1회 발생', async () => {
    const fs = new FocusState({ breakThresholdSec: 2 });
    fs.setState('BREAK');
    let alertCount = 0;
    fs.on('breakAlert', () => alertCount++);
    fs.start();
    // 2초 임계값 + 여유 1.2초
    await wait(3200);
    fs.stop();
    assert.equal(alertCount, 1);
  });

  it('짧은 WORK 복귀로는 breakAlert 재발생하지 않는다 (리셋 임계값 미달)', async () => {
    // resetThresholdSec=10초라 1초 작업 복귀로는 초기화되지 않음 → 재알림 없음
    const fs = new FocusState({ breakThresholdSec: 1, resetThresholdSec: 10 });
    let alertCount = 0;
    fs.on('breakAlert', () => alertCount++);
    fs.setState('BREAK');
    fs.start();
    await wait(1500);
    assert.equal(alertCount, 1);
    fs.setState('WORK');
    await wait(1100);   // 1초만 집중 (리셋 임계값 10초 미달)
    fs.setState('BREAK');
    await wait(1500);
    fs.stop();
    assert.equal(alertCount, 1); // 재발생 안 함
  });

  it('연속 집중을 리셋 임계값만큼 유지하면 쉬는시간/alert 초기화 후 재알림 가능', async () => {
    const fs = new FocusState({ breakThresholdSec: 1, resetThresholdSec: 1 });
    let alertCount = 0;
    fs.on('breakAlert', () => alertCount++);
    fs.setState('BREAK');
    fs.start();
    await wait(1500);
    assert.equal(alertCount, 1);
    // 연속 집중 1초 유지 → 초기화 (breakSeconds=0, breakAlertFired=false)
    fs.setState('WORK');
    await wait(1500);
    assert.equal(fs._breakSeconds, 0);
    // 다시 BREAK → 임계값 넘으면 재알림
    fs.setState('BREAK');
    await wait(1500);
    fs.stop();
    assert.equal(alertCount, 2);
  });
});
