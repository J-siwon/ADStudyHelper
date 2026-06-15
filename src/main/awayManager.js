'use strict';

// AWAY_NOTIFY_SEC 환경변수로 임계값 단축 가능 (테스트용)
// 기본값: awayThresholdMin(분) * 60초. 환경변수가 있으면 그 값(초) 사용.

const DEFAULT_AWAY_THRESHOLD_SEC = 10 * 60; // 10분

/**
 * 자리 비움 감지 + 폰 알림 관리자.
 *
 * @param {object} opts
 * @param {function} opts.getSettings        - () => { ntfyTopic, telegram, awayThresholdMin, cameraEnabled }
 * @param {function} opts.getIdleTimeSec     - () => number  (powerMonitor.getSystemIdleTime 또는 테스트 주입)
 * @param {function} opts.getFacePresent     - () => boolean (gazeManager에서 주입, 카메라 꺼짐 시 true 반환)
 * @param {function} opts.isManualBreak      - () => boolean (F3 controlServer 플래그 조회, 없으면 항상 false)
 * @param {function} opts.sendPhone          - async (message, settings) => void (notifier.sendPhone 또는 모킹)
 * @param {number}   [opts.pollIntervalMs]   - 폴링 간격(ms). 기본 5000.
 */
function createAwayManager({
  getSettings,
  getIdleTimeSec,
  getFacePresent,
  isManualBreak = () => false,
  sendPhone,
  pollIntervalMs = 5000,
}) {
  let _intervalId = null;
  let _awaySec = 0;         // 연속 자리비움 누적 초
  let _alertFired = false;  // 임계값 초과 알림 1회 발생 여부

  /**
   * 현재 away 여부 판정.
   * (카메라 켜짐 && facePresent=false) OR idleTime > idleThreshold(30초 하드코드)
   */
  function _isAway() {
    const settings = getSettings();
    const idleSec = getIdleTimeSec();

    // powerMonitor idle threshold: 30초 (시스템 잠금/화면보호기 수준)
    const IDLE_THRESHOLD_SEC = 30;

    if (idleSec >= IDLE_THRESHOLD_SEC) return true;

    if (settings.cameraEnabled) {
      const facePresent = getFacePresent();
      if (!facePresent) return true;
    }

    return false;
  }

  function _getThresholdSec() {
    // 환경변수 AWAY_NOTIFY_SEC 우선, 없으면 settings.awayThresholdMin * 60
    if (process.env.AWAY_NOTIFY_SEC) {
      return parseInt(process.env.AWAY_NOTIFY_SEC, 10);
    }
    const settings = getSettings();
    const min = settings.awayThresholdMin != null ? settings.awayThresholdMin : 10;
    return min * 60;
  }

  async function _tick(elapsedSec) {
    if (_isAway()) {
      _awaySec += elapsedSec;

      const thresholdSec = _getThresholdSec();
      if (!_alertFired && _awaySec >= thresholdSec) {
        _alertFired = true;
        // manualBreak(F3) 플래그가 on이면 알림 억제
        if (!isManualBreak()) {
          const settings = getSettings();
          try {
            await sendPhone('자리를 비운 지 오래됐어요! 다시 돌아오세요. 🐱', settings);
          } catch (err) {
            console.warn('[awayManager] 알림 전송 실패:', err.message);
          }
        } else {
          console.log('[awayManager] manualBreak 활성 — 알림 억제');
        }
      }
    } else {
      // 복귀 시 카운터 및 플래그 리셋
      if (_awaySec > 0 || _alertFired) {
        _awaySec = 0;
        _alertFired = false;
      }
    }
  }

  function start() {
    if (_intervalId) return;

    let lastTime = Date.now();

    _intervalId = setInterval(() => {
      const now = Date.now();
      const elapsedSec = (now - lastTime) / 1000;
      lastTime = now;
      _tick(elapsedSec);
    }, pollIntervalMs);
  }

  function stop() {
    if (_intervalId) {
      clearInterval(_intervalId);
      _intervalId = null;
    }
  }

  // 테스트용: 내부 상태 직접 접근
  function _getState() {
    return { awaySec: _awaySec, alertFired: _alertFired };
  }

  // 테스트용: tick을 직접 호출 (가짜 타이머 시나리오)
  async function _tickForTest(elapsedSec) {
    return _tick(elapsedSec);
  }

  return { start, stop, _getState, _tickForTest };
}

module.exports = { createAwayManager };
