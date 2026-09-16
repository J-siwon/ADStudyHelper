# Learning assessment adapter boundary

이 문서는 이전 학습 판정을 현재 수동 핸드오프에서 API 호출 방식으로 교체할 때의 경계를 정의한다.

## 그대로 유지하는 부분

- `src/main/learning.js`의 챕터 상태, 체크리스트, 완료와 복습 일정
- Renderer의 판정 미리보기, 사용자 수정과 최종 적용 화면
- `learning-assessment/v1` 결과 계약
- `curriculum-assessment/v1` 전체 범위 분석 계약
- `curriculum-detail-assessment/v1` 선택 챕터 일괄 상세 판정 계약
- 원문을 저장하지 않고 선택한 판정 근거만 저장하는 정책

## 현재 수동 어댑터가 담당하는 부분

`src/main/learning-assessment.js`의 `MANUAL_HANDOFF_ADAPTER`는 다음 두 작업만 담당한다.

1. 표준 판정 요청을 외부 채팅에 붙여넣을 프롬프트로 변환한다.
2. 사용자가 붙여넣은 JSON을 `learning-assessment/v1` 결과로 정규화한다.

단계별 학습과 복습도 같은 수동 확인 경계를 사용한다.

- `learning-stage-result/v1`: 현재 단계에서 새로 달성했다고 제안된 목표와 근거
- `learning-objective-result/v1`: 미달성 목표 집중 세션의 달성 제안
- `learning-review-assessment/v1`: 목표별 복습 답변의 정답·부분정답·오답 판정

세 결과 모두 외부 AI의 제안만으로 상태를 변경하지 않는다. 렌더러에서 사용자가 결과를 확인하거나 수정한 뒤 별도 완료 IPC를 호출해야 RP와 복습 상태가 저장된다.

클립보드 복사와 채팅 사이트 열기는 `src/main/index.js`의 `learning:preparePriorAssessment` IPC가 담당한다.

## API 어댑터가 담당할 부분

API를 연결할 때는 표준 요청을 받아 모델을 호출하고 아래 표준 결과를 반환하는 어댑터를 추가한다.

```text
assess(createAssessmentRequest(...) output)
  -> learning-assessment/v1 result
```

API 어댑터가 맡으면 좋은 작업은 다음과 같다.

- 이전 학습 원문 전송
- 구조화 출력 또는 JSON schema 강제
- 재시도, timeout과 공급자 오류 변환
- 모델·비용·token 제한 설정
- 응답을 `normalizeAssessmentResult`로 정규화

API key 저장, 네트워크 동의와 원문 전송 고지는 API 도입 시 별도로 구현해야 한다. API 결과도 즉시 완료 처리하지 않고 현재와 동일하게 사용자 미리보기와 승인을 거친다.

## 표준 결과 핵심 필드

```json
{
  "contract": "learning-assessment/v1",
  "schemaVersion": 1,
  "chapterId": "memory-alignment",
  "stageRecommendations": [],
  "objectiveRecommendations": [],
  "overallSummary": "",
  "weakPoints": []
}
```

공급자별 응답 형식은 어댑터 내부에서만 처리하며 상태 모듈과 Renderer로 전파하지 않는다.

## 전체 커리큘럼 분석

전체 불러오기는 두 어댑터로 나뉜다.

1. `MANUAL_CURRICULUM_ADAPTER`는 40개 챕터를 `unseen`, `familiar`, `practiced`, `applied`로 분류한다. 이 결과는 coverage 표시만 갱신하고 체크리스트나 완료 상태를 바꾸지 않는다.
2. `MANUAL_CURRICULUM_DETAIL_ADAPTER`는 사용자가 선택한 챕터만 단계·목표 단위로 판정한다. 일부 단계만 승인하면 `Progress`, 6단계를 모두 승인하면 `Completed`가 된다. 이때 미달성 목표는 그대로 남고 이후 목표 집중 학습으로 달성할 수 있다.

API 전환 시에도 범위 분석과 상세 판정을 분리하면 낮은 비용의 모델로 전체 분류를 수행한 뒤 필요한 챕터만 정밀 모델에 전달할 수 있다.
