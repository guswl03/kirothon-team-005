# Implementation Plan

## Overview

A 담당 데스크톱 통합 안정화 작업이다. 모든 코드 수정은 `src/main`, `src/native`, `test/desktop`, `scripts`, `docs` 범위에서 한다.

## Tasks

- [x] 1. Kiro 기반 구축
  - 스티어링, 훅, 스펙을 만든다. 저장 시 테스트·점검 훅은 공통 훅(`test-on-save`, `security-check-on-save`)을 쓰고, A 전용으로는 작업 완료 후 스모크 훅만 둔다.
  - _Requirements: 6.1_
- [x] 2. 호환성 측정 도구
  - [x] 2.1 `scripts/compat-probe.ps1`과 `npm run compat`
    - _Requirements: 1.1, 1.2, 1.3, 1.4_
  - [x] 2.2 `docs/COMPATIBILITY.md` 양식과 출력 파서 테스트
    - _Requirements: 1.4_
- [x] 3. 감지 개선
  - [x] 3.1 폴링 설정값과 미지원 상태 보고
    - _Requirements: 2.1, 2.2, 2.3, 3.1_
  - [x] 3.2 watcher 파싱, 미지원 안내, 속성 테스트
    - _Requirements: 2.4, 3.2, 3.3_
- [x] 4. 창 동작
  - 크기 제한 보정과 포커스 유지, 배치 속성 테스트
  - _Requirements: 4.1, 4.2, 4.3, 4.4_
- [x] 5. 패키징
  - `npm run dist`와 패키징 exe 스모크 확인
  - _Requirements: 5.1, 5.2, 5.3_
- [x] 6. 보안 리뷰
  - A 영역 리뷰, `check.js` 보강, `SECURITY_REVIEW.md` 갱신
  - _Requirements: 6.1, 6.3_
- [x] 7. 인수인계와 최종 검증
  - `docs/handoff/A-desktop.md` 작성, 세 명령 재실행
  - _Requirements: 6.1_
- [ ]* 8. 실제 프로그램 실측
  - 사용자가 시연 대상에서 `npm run compat`을 실행해 표를 채운다.
  - _Requirements: 1.1_

- [x] 9. 메신저 드래그 감지
  - [x] 9.1 커서 아래 요소 탐색(감지와 측정 도구), DPI 좌표 맞춤
    - _Requirements: 7.1_
  - [x] 9.2 `copyFallback` 설정, 트레이 옵션과 동의 창, 미지원 안내에 옵션 표시
    - _Requirements: 7.2, 7.5_
  - [x] 9.3 복사 대체 경로(허용 확인, 클립보드 백업·복원), watcher 인자와 `via`
    - _Requirements: 7.3, 7.4_
  - [x] 9.4 `check.js` 규칙, steering·보안 문서·호환성 체크리스트
    - _Requirements: 7.6_
  - [ ]* 9.5 카카오톡·디스코드 실기기 확인(`docs/COMPATIBILITY.md` 메신저 체크리스트)
    - 에이전트가 실행한 프로세스는 다른 앱에 키 입력을 보낼 수 없어서 사용자가 직접 확인한다.
    - _Requirements: 7.1, 7.3, 7.4_

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4"] },
    { "id": 2, "tasks": ["2.2", "3.2"] },
    { "id": 3, "tasks": ["5", "6"] },
    { "id": 4, "tasks": ["7", "8", "9.1", "9.2"] },
    { "id": 5, "tasks": ["9.3"] },
    { "id": 6, "tasks": ["9.4"] },
    { "id": 7, "tasks": ["9.5"] }
  ]
}
```

## Notes

- 8번과 9.5는 사용자가 직접 수행해야 하므로 자동으로 완료 처리하지 않는다.