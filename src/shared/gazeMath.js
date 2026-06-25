/* gazeMath.js — MediaPipe FaceLandmarker 랜드마크 → 시선 판정 (순수 로직)
 *
 * 브라우저(렌더러)에서는 <script src>로 로드되어 window.gazeMath 로 노출되고,
 * Node 테스트에서는 require로 불러 단위 테스트한다 (UMD).
 *
 * 입력 landmarks: MediaPipe FaceLandmarker result.faceLandmarks[0]
 *   = [{x, y, z}, ...] (정규화 0~1 좌표, iris 포함 478개)
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.gazeMath = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // FaceLandmarker(iris refine) 랜드마크 인덱스
  var IDX = {
    rightEye: { outer: 33, inner: 133, top: 159, bottom: 145, iris: 468 },
    leftEye: { outer: 263, inner: 362, top: 386, bottom: 374, iris: 473 },
  };

  var DEFAULTS = {
    hThreshold: 0.20, // 수평 시선 이탈 허용치 (|hRatio-0.5|)
    vThreshold: 0.26, // 수직 시선 이탈 허용치 (|vRatio-0.5|)
    minLandmarks: 478, // iris 포함 랜드마크 수
  };

  function safeRatio(value, a, b) {
    var denom = b - a;
    if (denom === 0) return 0.5;
    return (value - a) / denom;
  }

  // 한쪽 눈의 수평/수직 시선 비율 (0.5=중앙)
  function eyeRatios(lm, eye) {
    var iris = lm[eye.iris];
    var inner = lm[eye.inner];
    var outer = lm[eye.outer];
    var top = lm[eye.top];
    var bottom = lm[eye.bottom];
    return {
      h: safeRatio(iris.x, inner.x, outer.x),
      v: safeRatio(iris.y, top.y, bottom.y),
    };
  }

  /**
   * landmarks → { present, hRatio, vRatio, onScreen }
   * - present: 얼굴 랜드마크(iris 포함)가 충분히 있는지
   * - hRatio/vRatio: 양안 평균 시선 비율 (0.5=정면)
   * - onScreen: 시선이 화면 안을 향하는지 (임계값 이내)
   */
  function computeGaze(landmarks, opts) {
    var o = opts || {};
    var hThr = o.hThreshold != null ? o.hThreshold : DEFAULTS.hThreshold;
    var vThr = o.vThreshold != null ? o.vThreshold : DEFAULTS.vThreshold;
    var minLm = o.minLandmarks != null ? o.minLandmarks : DEFAULTS.minLandmarks;

    if (!landmarks || landmarks.length < minLm) {
      return { present: false, hRatio: null, vRatio: null, onScreen: false };
    }

    var r = eyeRatios(landmarks, IDX.rightEye);
    var l = eyeRatios(landmarks, IDX.leftEye);
    var hRatio = (r.h + l.h) / 2;
    var vRatio = (r.v + l.v) / 2;

    var onScreen =
      Math.abs(hRatio - 0.5) <= hThr &&
      Math.abs(vRatio - 0.5) <= vThr;

    return { present: true, hRatio: hRatio, vRatio: vRatio, onScreen: onScreen };
  }

  return {
    computeGaze: computeGaze,
    _IDX: IDX,
    _DEFAULTS: DEFAULTS,
  };
});
