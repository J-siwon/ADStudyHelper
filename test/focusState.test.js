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

  it('WORK → BREAK → WORK 전환 시 breakSeconds 리셋', () => {
    fs.setState('WORK');
    fs.setState('BREAK');
    fs._breakSeconds = 5;
    fs.setState('WORK');
    assert.equal(fs._breakSeconds, 0);
    assert.equal(fs._breakAlertFired, false);
  });
});

describe('FocusState — tick 타이머', () => {
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

  it('WORK 복귀 후 BREAK 다시 임계값 넘으면 breakAlert 재발생', async () => {
    const fs = new FocusState({ breakThresholdSec: 1 });
    let alertCount = 0;
    fs.on('breakAlert', () => alertCount++);
    fs.setState('BREAK');
    fs.start();
    // 첫 번째 alert 대기 (1초 임계값 + 여유)
    await wait(1500);
    assert.equal(alertCount, 1);
    // WORK 복귀 후 다시 BREAK
    fs.setState('WORK');
    await wait(100);
    fs.setState('BREAK');
    await wait(1500);
    fs.stop();
    assert.equal(alertCount, 2);
  });
});
