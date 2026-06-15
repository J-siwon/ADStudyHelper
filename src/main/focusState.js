'use strict';

const { EventEmitter } = require('events');

// BREAK 임계값 상수: 기본 600초. 환경변수 FOCUS_BREAK_SEC이 있으면 그 값 사용(테스트용 단축).
const BREAK_THRESHOLD_SEC = process.env.FOCUS_BREAK_SEC
  ? parseInt(process.env.FOCUS_BREAK_SEC, 10)
  : 600;

/**
 * 집중 상태 머신
 *
 * 이벤트:
 *   'stateChange'  -> (state: "WORK"|"BREAK")
 *   'breakAlert'   -> ()   // 연속 BREAK가 임계값 초과 시 1회 발생, WORK 복귀 시 리셋
 *   'tick'         -> ({ state, workSeconds, breakSeconds })  // 1초마다
 */
class FocusState extends EventEmitter {
  constructor({ breakThresholdSec } = {}) {
    super();
    this._breakThresholdSec = breakThresholdSec != null
      ? breakThresholdSec
      : BREAK_THRESHOLD_SEC;

    this._state = 'BREAK';
    this._workSeconds = 0;
    this._breakSeconds = 0;
    this._breakAlertFired = false;
    this._tickInterval = null;
  }

  // 매 폴링마다 호출. 현재 상태를 갱신.
  setState(state) {
    if (state !== 'WORK' && state !== 'BREAK') return;

    const prev = this._state;
    this._state = state;

    if (prev !== state) {
      // WORK로 복귀하면 BREAK 카운터 및 alert 플래그 리셋
      if (state === 'WORK') {
        this._breakSeconds = 0;
        this._breakAlertFired = false;
      }
      this.emit('stateChange', state);
    }
  }

  // 1초 타이머 시작
  start() {
    if (this._tickInterval) return;
    this._tickInterval = setInterval(() => {
      if (this._state === 'WORK') {
        this._workSeconds += 1;
      } else {
        this._breakSeconds += 1;
        // 연속 BREAK가 임계값 초과 시 1회 발생
        if (!this._breakAlertFired && this._breakSeconds >= this._breakThresholdSec) {
          this._breakAlertFired = true;
          this.emit('breakAlert');
        }
      }
      this.emit('tick', {
        state: this._state,
        workSeconds: this._workSeconds,
        breakSeconds: this._breakSeconds,
      });
    }, 1000);
  }

  stop() {
    if (this._tickInterval) {
      clearInterval(this._tickInterval);
      this._tickInterval = null;
    }
  }

  // 누적 WORK 초
  getWorkSeconds() {
    return this._workSeconds;
  }
}

module.exports = FocusState;
