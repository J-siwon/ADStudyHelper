# 게임 개발 학습 앱 기획 정리

## 1. 앱의 목적

이 앱의 목적은 단순히 공부한 내용을 기록하는 것이 아니다.

핵심은 사용자가 다음 학습 사이클을 반복하도록 돕는 것이다.

> **커리큘럼을 확인한다 → 챕터를 시작한다 → AI와 공부한다 → 이해를 검증한다 → 챕터를 완료한다 → 이후 복습한다**

즉, 이 앱은 **공부 체크리스트**가 아니라  
사용자의 학습 방법 자체를 실행시키는 **학습 런타임**을 목표로 한다.

---

# 2. 앱의 핵심 학습 철학

앱은 다음 세 가지를 지속적으로 유도해야 한다.

## 2.1 정답을 보기 전에 먼저 생각하기

사용자는 새로운 개념을 접했을 때 바로 설명을 읽는 것이 아니라  
먼저 자신의 예상이나 가설을 만들어야 한다.

예:

```text
질문
↓
내 예상
↓
왜 그렇게 생각했는지 설명
↓
정답 확인
↓
틀린 부분 수정
```

예를 들어:

```cpp
struct A
{
    char a;
    int b;
};
```

질문:

> sizeof(A)는 몇 바이트일까?

사용자가 먼저 추론한 뒤 AI가 피드백한다.

---

## 2.2 새로운 것으로 넘어가기 전에 끝내기

하나의 주제를 어느 정도 이해한 뒤  
새로운 주제가 궁금해졌다고 바로 이동하지 않는다.

현재 챕터는 끝까지 완료한다.

새롭게 생긴 궁금증은 별도의 목록에 저장한다.

```text
현재 학습
Memory Alignment

궁금한 것
- ABI란?
- SIMD alignment란?
- GCC와 MSVC의 struct layout은 왜 다를까?
```

즉,

> **궁금증은 저장하지만 현재 흐름은 유지한다.**

---

## 2.3 한 번 배웠다고 끝내지 않기

챕터를 완료했다고 완전히 아는 것은 아니다.

```text
Completed ≠ Mastered
```

챕터 완료 이후에도 일정 시간이 지나면 다시 문제를 풀고  
기억이 유지되는지 검증한다.

---

# 3. 전체 앱 흐름

```text
전체 커리큘럼
      ↓
학습 영역
      ↓
챕터
      ↓
챕터 상세
      ↓
AI 학습 세션
      ↓
이해 검증
      ↓
챕터 완료
      ↓
복습 등록
      ↓
장기 기억 검증
```

---

# 4. 전체 커리큘럼 구조

## 4.1 Computer Science

```text
Computer Science
├── Computer Basics
├── Data Representation
├── Memory
├── CPU
├── Operating System
├── Concurrency
└── Network
```

### Memory 예시

```text
Memory
├── Bit & Byte
├── Data Type
├── Memory Address
├── Alignment
├── Padding
├── Stack
├── Heap
├── Stack Frame
└── Virtual Memory
```

---

## 4.2 Programming

```text
Programming
├── C++
├── C#
├── Data Structure
└── Algorithms
```

### C++ 핵심 영역

```text
C++
├── Pointer
├── Reference
├── const
├── Object Lifetime
├── Stack / Heap
├── RAII
├── Copy
├── Move
├── Smart Pointer
├── Polymorphism
├── Template
└── STL
```

### C# 핵심 영역

```text
C#
├── Value Type / Reference Type
├── Object Lifetime
├── Garbage Collection
├── Boxing / Unboxing
├── Delegate
├── Event
├── Generic
├── Collection
├── LINQ
├── Closure
└── Async
```

---

## 4.3 Game Fundamentals

```text
Game Fundamentals
├── Game Math
├── Graphics
├── Physics
└── Game Architecture
```

### Game Math

```text
Vector
↓
Coordinate System
↓
Dot Product
↓
Cross Product
↓
Matrix
↓
Transform
↓
Euler Angle
↓
Quaternion
↓
Interpolation
```

---

## 4.4 Unity

```text
Unity
├── Engine Architecture
├── GameObject / Component
├── MonoBehaviour
├── Lifecycle
├── Serialization
├── Scene
├── Prefab
├── Physics
├── Rendering
├── Resource Management
├── UI
├── Coroutine
├── Garbage Collection
└── Profiling
```

Unity는 기능 사용법보다 내부 동작을 중심으로 공부한다.

예:

```text
Coroutine을 어떻게 쓰는가?
```

보다

```text
Coroutine은 Thread인가?
누가 실행시키는가?
언제 다시 실행되는가?
메인 스레드와 어떤 관계인가?
```

를 중심으로 학습한다.

---

## 4.5 Practical Development

```text
Practical Development
├── Inventory
├── FSM
├── Skill System
├── Save System
├── Object Pool
├── UI Architecture
├── Character Controller
├── Interaction System
├── Quest System
└── Event System
```

하나의 큰 게임을 만들기보다  
작은 시스템을 처음부터 끝까지 완성하는 것을 우선한다.

---

## 4.6 Career

```text
Career
├── Coding Test
├── CS Interview
├── C++ Interview
├── Unity Interview
├── Project Interview
└── Portfolio
```

---

# 5. 챕터 구조

각 챕터는 단순한 제목이 아니라  
명확한 완료 조건을 가져야 한다.

예:

```text
Memory > Alignment
```

## 학습 목표

- Alignment의 정의를 설명할 수 있다.
- Alignment가 필요한 이유를 CPU 관점에서 설명할 수 있다.
- 구조체의 padding을 계산할 수 있다.
- sizeof 결과를 예측할 수 있다.
- 처음 보는 구조체의 memory layout을 추론할 수 있다.

---

# 6. 챕터 상세 화면

예시:

```text
Memory > Alignment

Status
Learning

Progress

이해        ████░
추론        ███░░
응용        ██░░░
설명        ███░░
복습        ░░░░░

Prerequisite
✓ Memory Address
✓ Data Type

Learning Goals
- Alignment 정의 설명
- Padding 계산
- sizeof 예측
- CPU 관점 설명

[챕터 시작]
```

---

# 7. 챕터 시작

사용자가 `챕터 시작` 버튼을 누르면 AI 채팅 세션이 시작된다.

단순히

```text
Alignment를 알려줘.
```

라고 AI에게 보내지 않는다.

앱 내부에서 학습 규칙과 목표를 함께 전달한다.

예:

```text
사용자는 Memory Alignment 챕터를 학습 중이다.

학습 목표:
1. Alignment를 설명할 수 있다.
2. CPU 관점에서 Alignment의 필요성을 설명할 수 있다.
3. Struct Padding을 계산할 수 있다.
4. sizeof 결과를 추론할 수 있다.
5. 새로운 구조체 Layout을 분석할 수 있다.

학습 규칙:
- 정답을 먼저 알려주지 않는다.
- 사용자가 먼저 추론하도록 한다.
- 사용자 답변에서 맞는 부분과 부족한 부분을 구분한다.
- Why 질문을 통해 원리를 더 깊이 탐색한다.
- 개념 → 코드 → 변형 문제 → 설명 → 검증 순서로 진행한다.
```

---

# 8. 기본 학습 루프

모든 챕터는 기본적으로 다음 학습 사이클을 따른다.

```text
① 문제 제시
      ↓
② 사용자 예상
      ↓
③ 추론 설명
      ↓
④ 피드백
      ↓
⑤ 원리 학습
      ↓
⑥ Why Down
      ↓
⑦ 코드 검증
      ↓
⑧ 변형 문제
      ↓
⑨ 사용자 설명
      ↓
⑩ 최종 테스트
      ↓
⑪ 완료
```

---

# 9. Why Down

하나의 개념을 배웠으면 최소 몇 단계 더 내려가 본다.

예:

```text
왜 Padding이 생기는가?
↓
Alignment 때문
↓
왜 Alignment가 필요한가?
↓
CPU Memory Access 때문
↓
왜 특정 경계가 중요한가?
↓
CPU가 메모리를 일정 단위로 읽기 때문
```

단순히 정의를 외우는 것이 아니라  
원인이 어디까지 연결되는지를 확인한다.

---

# 10. 학습 Stage

AI 채팅 세션 상단에는 현재 학습 단계가 표시된다.

예:

```text
Memory Alignment

1. 개념 발견       ✓
2. 원리 이해       ✓
3. 코드 추론       ●
4. 변형 문제
5. 설명
6. 최종 검증
```

게임처럼 과하게 꾸미기보다는  
현재 어디까지 진행했는지를 알려주는 용도로 사용한다.

---

# 11. AI 학습 평가

AI는 대화만 생성하는 것이 아니라  
현재 사용자의 이해 상태를 구조화된 데이터로 반환한다.

예:

```json
{
  "understanding": 4,
  "reasoning": 3,
  "application": 2,
  "explanation": 3,
  "weakPoints": [
    "tail padding",
    "nested struct alignment"
  ]
}
```

UI에서는 다음처럼 보여준다.

```text
개념 이해      ●●●●○
추론 능력      ●●●○○
응용 능력      ●●○○○
설명 능력      ●●●○○
```

---

# 12. 지식 숙련도

하나의 지식은 다음 단계로 평가한다.

## Lv.0 — 처음 봄

```text
Stack Frame이라는 용어를 들어본 적 있다.
```

## Lv.1 — 설명 가능

```text
Stack Frame이 무엇인지 설명할 수 있다.
```

## Lv.2 — 추론 가능

```text
코드를 보고 Stack Pointer가 어떻게 변할지 추론할 수 있다.
```

## Lv.3 — 응용 가능

```text
Recursion
Stack Overflow
Calling Convention
Compiler Optimization
```

등과 연결해서 설명할 수 있다.

핵심 CS 영역은 Lv.2 이상을 목표로 한다.

---

# 13. 챕터 상태

```text
Locked
↓
Ready
↓
Learning
↓
Completed
↓
Review Needed
↓
Mastered
```

## Locked

선행 챕터를 아직 완료하지 않음.

## Ready

학습 시작 가능.

## Learning

현재 학습 중.

## Completed

한 번의 학습 사이클을 끝냄.

## Review Needed

복습이 필요하거나 복습 테스트에서 부족함이 발견됨.

## Mastered

시간이 지난 뒤에도 문제를 풀고 설명할 수 있음.

---

# 14. 완료와 마스터의 분리

매우 중요한 규칙:

```text
Completed ≠ Mastered
```

`Completed`는

> 이 챕터의 학습 과정을 한 번 끝냈다.

라는 의미이다.

`Mastered`는

> 시간이 지나도 기억하고 있으며 응용할 수 있다.

라는 의미이다.

이렇게 함으로써 완벽하게 이해할 때까지  
하나의 챕터에서 멈춰 있는 것을 방지한다.

---

# 15. 챕터 완료

AI가 자동으로 챕터를 완료시키지 않는다.

AI는 다음과 같이 알려준다.

```text
현재 챕터의 핵심 목표를 모두 한 번 이상 다뤘습니다.

[계속 공부]
[챕터 완료]
```

최종 완료 행동은 사용자가 직접 한다.

이는 공부를 끝내는 행동 자체를 훈련하기 위함이다.

---

# 16. 완료 후 자동 요약

챕터를 완료하면 AI가 학습 내용을 자동으로 정리한다.

예:

```text
Memory Alignment

오늘 배운 것
- Alignment는 데이터가 특정 주소 경계에 위치하도록 하는 규칙이다.
- 구조체 내부에는 Padding이 발생할 수 있다.
- 구조체 크기는 가장 큰 Alignment의 배수가 될 수 있다.

잘 이해한 것
- Member Padding 계산
- Struct Alignment 계산

헷갈린 것
- Tail Padding
- Nested Struct Alignment

잘못된 추론
- 모든 데이터가 8 Byte 기준으로 정렬된다고 생각함

다음 복습에서 확인할 것
- Padding 계산
- Alignment가 필요한 이유 설명
```

---

# 17. 복습 시스템

챕터 완료 후 자동으로 복습 일정을 등록한다.

기본 예시:

```text
1일 후
3일 후
7일 후
30일 후
```

홈 화면에 다음처럼 표시한다.

```text
오늘의 복습

Memory Alignment     3일 복습
Stack Frame          7일 복습
Vector              30일 복습
```

---

# 18. 복습 세션

처음 학습과 복습은 방식이 다르다.

## 처음 학습

```text
문제
↓
추론
↓
설명
↓
추가 설명
↓
코드
↓
응용
```

## 복습

```text
문제
↓
문제
↓
설명
↓
응용
```

복습에서는 AI가 먼저 설명하지 않는다.

사용자가 기억을 직접 꺼내도록 만든다.

예:

```text
Alignment가 필요한 이유를 CPU 관점에서 설명해봐.
```

또는

```cpp
struct A
{
    char a;
    double b;
    int c;
};
```

```text
일반적인 64-bit 환경에서
메모리 Layout과 sizeof를 계산해봐.
```

복습 결과가 부족하면:

```text
Completed
↓
Review Needed
```

상태로 변경된다.

---

# 19. Parking Lot

공부 중 다른 궁금증이 생겼을 때  
현재 챕터를 벗어나지 않도록 하는 기능이다.

예:

```text
현재 학습
Memory Alignment
```

공부 중 생긴 궁금증:

```text
- ABI란?
- SIMD란?
- GCC와 MSVC의 Layout 차이는?
```

이를 바로 공부하지 않고 Parking Lot에 저장한다.

```text
Parking Lot

□ ABI
□ SIMD Alignment
□ Compiler 별 Struct Layout
```

핵심:

> **궁금증은 잃어버리지 않되 현재 챕터는 끝낸다.**

---

# 20. Side Topic

Parking Lot의 주제 중 중요도가 높은 것은  
별도의 Side Topic으로 만들 수 있다.

```text
Side Topics

- ABI
- Calling Convention
- SIMD
```

하지만 Side Topic 때문에  
현재 메인 커리큘럼 진행이 끊기지 않도록 한다.

---

# 21. 홈 화면

홈 화면은 최대한 단순해야 한다.

예:

```text
오늘의 학습

[이어서 공부하기]

Memory / Stack Frame
진행도 63%

[오늘의 복습]

3개

[전체 커리큘럼]

전체 진행도 12%
```

초기에는 복잡한 통계나 그래프를 최소화한다.

---

# 22. 커리큘럼 화면

커리큘럼은 학습 경로가 보이도록 표현한다.

예:

```text
Computer Fundamentals

● Bit & Byte
│
● Data Representation
│
● Memory Address
│
● Alignment
│
◉ Stack / Heap
│
○ Stack Frame
│
○ Function Call
│
🔒 Virtual Memory
```

상태:

```text
● Completed
◉ Learning
○ Ready
🔒 Locked
```

---

# 23. Chapter 데이터 구조 예시

```csharp
public class Chapter
{
    public string Id;
    public string Title;

    public string Description;

    public List<string> Prerequisites;

    public List<LearningObjective> Objectives;

    public ChapterStatus Status;

    public LearningProgress Progress;

    public List<ReviewSchedule> Reviews;
}
```

---

# 24. Learning Objective

```csharp
public class LearningObjective
{
    public string Id;

    public string Description;

    public ObjectiveLevel RequiredLevel;
}
```

---

# 25. Learning Progress

```csharp
public class LearningProgress
{
    public int Understanding;
    public int Reasoning;
    public int Application;
    public int Explanation;
}
```

---

# 26. Chapter Status

```csharp
public enum ChapterStatus
{
    Locked,
    Ready,
    Learning,
    Completed,
    ReviewNeeded,
    Mastered
}
```

---

# 27. 앱 개발 우선순위

## MVP

먼저 다음 기능만 완성한다.

```text
1. 전체 커리큘럼
2. Chapter 상세 화면
3. Chapter 시작
4. AI Chat
5. Chapter 완료
6. 학습 세션 저장
7. 진행 상태 표시
```

---

## V2

```text
8. AI 자동 평가
9. 복습 시스템
10. Review Needed
11. 세션 자동 요약
12. Parking Lot
```

---

## V3

```text
13. 지식 그래프
14. 약점 분석
15. 코딩 문제
16. 인터뷰 모드
17. 프로젝트 연계
18. 학습 통계
```

---

# 28. 첫 개발 목표

처음부터 전체 커리큘럼과 수백 개 챕터를 만들지 않는다.

첫 번째 목표는:

> **Memory > Alignment 챕터 하나가 처음부터 끝까지 실제로 동작하도록 만든다.**

구현 범위:

```text
커리큘럼 화면
↓
Alignment Chapter
↓
Chapter Detail
↓
Chapter Start
↓
AI Chat
↓
Learning Stage
↓
Chapter Complete
↓
Session Summary
↓
Review 등록
```

즉, 앱 전체의 기능을 하나의 챕터에 대해 먼저 완성한다.

이를 **Vertical Slice**로 사용한다.

이 구조가 제대로 동작하면  
이후에는 새로운 챕터 데이터를 추가하는 방식으로 확장한다.

---

# 29. 이 앱의 최종 목표

이 앱은 사용자가 공부를 많이 하도록 만드는 것이 목적이 아니다.

목표는 다음 능력을 만드는 것이다.

> **코드를 보고 무엇을 하는지만 아는 것이 아니라,  
> 왜 이렇게 작성되었고 컴파일러·CPU·메모리·OS·엔진에서 어떻게 동작하며  
> 어떤 비용과 트레이드오프가 발생하는지를 추론할 수 있는 게임 개발자**

이를 위해 학습은 다음 흐름을 반복한다.

```text
질문
↓
추론
↓
틀림
↓
피드백
↓
원리
↓
구현
↓
검증
↓
설명
↓
완료
↓
복습
```

---

# 30. 앱 설계 원칙 요약

## 원칙 1

정답을 보기 전에 반드시 먼저 생각한다.

## 원칙 2

하나의 챕터는 반드시 끝낸다.

## 원칙 3

궁금한 내용은 Parking Lot에 저장한다.

## 원칙 4

Completed와 Mastered를 구분한다.

## 원칙 5

AI는 설명자가 아니라 질문자이자 피드백 제공자로 동작한다.

## 원칙 6

사용자의 답을 통해 이해도를 계속 평가한다.

## 원칙 7

학습 완료 후 반드시 다시 복습한다.

## 원칙 8

진행률보다 실제 이해와 추론 능력을 중요하게 본다.

## 원칙 9

큰 프로젝트보다 작은 시스템을 완성하는 경험을 반복한다.

## 원칙 10

첫 번째 버전은 Alignment Chapter 하나를 완전히 동작시키는 것을 목표로 한다.
