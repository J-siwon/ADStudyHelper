'use strict';

const { EventEmitter } = require('events');

// BREAK 임계값 상수: 기본 600초. 환경변수 FOCUS_BREAK_SEC이 있으면 그 값 사용(테스트용 단축).
const BREAK_THRESHOLD_SEC = process.env.FOCUS_BREAK_SEC
  ? parseInt(process.env.FOCUS_BREAK_SEC, 10)
  : 600;

// 쉬는시간 초기화 임계값: 연속 WORK를 이만큼(초) 유지하면 누적 쉬는시간/alert를 초기화.
// 기본 600초(10분). 환경변수 FOCUS_RESET_SEC로 단축 가능(테스트용).
const WORK_RESET_SEC = process.env.FOCUS_RESET_SEC
  ? parseInt(process.env.FOCUS_RESET_SEC, 10)
  : 600;

/**
 * 집중 상태 머신
 *
 * 이벤트:
 *   'stateChange'  -> (state: "WORK"|"BREAK")
 *   'breakAlert'   -> ()   // 연속 BREAK가 임계값 초과 시 1회 발생
 *   'tick'         -> ({ state, workSeconds, breakSeconds, contWorkSeconds })  // 1초마다
 *
 * 쉬는시간(breakSeconds) 규칙:
 *   - BREAK 동안 1초씩 누적.
 *   - WORK로 복귀해도 "즉시" 초기화하지 않고 누적값을 유지(짧게 작업 복귀해도 보존).
 *   - 연속 WORK를 resetThresholdSec(기본 10분)만큼 유지해야 0으로 초기화(+alert 플래그 리셋).
 */
class FocusState extends EventEmitter {
  constructor({ breakThresholdSec, resetThresholdSec } = {}) {
    super();
    this._breakThresholdSec = breakThresholdSec != null
      ? breakThresholdSec
      : BREAK_THRESHOLD_SEC;
    this._resetThresholdSec = resetThresholdSec != null
      ? resetThresholdSec
      : WORK_RESET_SEC;

    this._state = 'BREAK';
    this._workSeconds = 0;
    this._breakSeconds = 0;
    this._contWorkSeconds = 0;   // 마지막 BREAK 이후 연속 WORK 누적초
    this._breakAlertFired = false;
    this._breakAlertSuppressed = false;
    this._tickInterval = null;
  }

  // 매 폴링마다 호출. 현재 상태를 갱신.
  setState(state) {
    if (state !== 'WORK' && state !== 'BREAK') return;

    const prev = this._state;
    this._state = state;

    if (prev !== state) {
      // BREAK로 진입하면 연속 집중 카운터를 0으로 (다시 임계값만큼 채워야 쉬는시간 초기화됨)
      if (state === 'BREAK') {
        this._contWorkSeconds = 0;
      }
      // WORK로 복귀해도 breakSeconds/alert는 즉시 초기화하지 않는다.
      // → tick에서 연속 집중이 임계값에 도달했을 때만 초기화.
      this.emit('stateChange', state);
    }
  }

  // 1초 타이머 시작
  start() {
    if (this._tickInterval) return;
    this._tickInterval = setInterval(() => {
      if (this._state === 'WORK') {
        this._workSeconds += 1;
        this._contWorkSeconds += 1;
        // 연속 집중을 임계값만큼 유지 → 누적 쉬는시간/alert 초기화
        if (this._contWorkSeconds >= this._resetThresholdSec) {
          this._breakSeconds = 0;
          this._breakAlertFired = false;
        }
      } else {
        this._breakSeconds += 1;
        // 연속 BREAK가 임계값 초과 시 1회 발생
        if (!this._breakAlertSuppressed
          && !this._breakAlertFired
          && this._breakSeconds >= this._breakThresholdSec) {
          this._breakAlertFired = true;
          this.emit('breakAlert');
        }
      }
      this.emit('tick', {
        state: this._state,
        workSeconds: this._workSeconds,
        breakSeconds: this._breakSeconds,
        contWorkSeconds: this._contWorkSeconds,
      });
    }, 1000);
  }

  stop() {
    if (this._tickInterval) {
      clearInterval(this._tickInterval);
      this._tickInterval = null;
    }
  }

  // 현재 상태('WORK'|'BREAK')
  getState() {
    return this._state;
  }

  // 누적 WORK 초
  getWorkSeconds() {
    return this._workSeconds;
  }

  // 사용자가 지정한 휴식 중에는 경고를 보류한다. 휴식이 끝난 뒤에도 BREAK면 다음 tick에서 경고 가능.
  setBreakAlertSuppressed(suppressed) {
    this._breakAlertSuppressed = suppressed === true;
  }
}

module.exports = FocusState;
