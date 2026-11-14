# Implementation Plan

## Overview

B 역할(AI·검색) 품질 개선 작업 목록이다. 브랜치는 `feat/ai`. 완료 항목에는 커밋과 검증 테스트를 적는다.

## Tasks

- [x] 1. Kiro CLI 실행 격리와 타임아웃 설정
  - `cwd`를 `os.tmpdir()/conversation-cheatsheet-kiro`로 격리, `KIRO_TIMEOUT_MS` 지원
  - 커밋 `21bbde7`, 테스트 `test/ai/providers.test.js`
  - _Requirements: 1.1, 1.2, 1.3, 1.4_
- [x] 2. 프롬프트 데이터 구분자 보호
  - `escapeData`, `SOURCE_CHARS`, `<question>`·`<direction>` 태그
  - 커밋 `80c875f`, 테스트 `test/ai/prompt.test.js`
  - _Requirements: 2.1, 2.2, 2.3_
- [x] 3. 검색 보강
  - `keywordQuery`, `latinQuery`, 단계별 재검색과 병합
  - 커밋 `ffca2c4`, 테스트 `test/ai/search.test.js`
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_
- [x] 4. 출처 내용 검증
  - `supportScore`, `SUPPORT_MIN = 0.3`, 모든 항목 유형에 적용
  - 커밋 `1cb7db1`, 테스트 `test/ai/schema.test.js`
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_
- [x] 5. Kiro CLI 실측 스크립트
  - [x] 5.1 측정·요약 (커밋 `b15c480`. `--offline`은 Task 8에서 제거)
    - _Requirements: 5.1, 5.2, 5.4_
  - [x] 5.2 kiro-cli 로그인 세션 인정(`kiro-cli whoami`)과 미준비 시 종료 코드 2
    - _Requirements: 5.3, 5.5_
- [ ] 6. 실측 기반 프롬프트 튜닝
  - [x] 6.1 kiro-cli 로그인 후 `node scripts/measure-kiro.js --runs 2`로 기준선 측정
    - 2026-11-14, kiro-cli 3.3.0, 로그인 세션 인증. 6회 중 3회 완료 후 측정 프로세스가 중단됨(원인 미확인). 주제 3(영어 혼합)은 아직 측정하지 못함.
    - | 주제 | 회차 | 응답(ms) | JSON | 문장 | 질문 | 전환 | 출처 연결 문장 | 목표 충족 |
      |---|---|---|---|---|---|---|---|---|
      | 1 짧은 명사 | 1 | 27,989 | 성공 | 7 | 5 | 4 | 6 | 예 |
      | 1 짧은 명사 | 2 | 20,659 | 성공 | 7 | 6 | 4 | 6 | 예 |
      | 2 긴 한국어 문장 | 1 | 22,935 | 성공 | 6 | 5 | 4 | 2 | 예 |
    - 요약(3회): JSON 파싱 3/3, 목표 개수 충족 3/3, 응답 20.7~28.0초(중앙값 22.9초). 타임아웃 120초 대비 여유 있음.
    - 2026-11-14 추가 측정 `node scripts/measure-kiro.js --runs 1`(kiro-cli 3.3.0, 로그인 세션, 검색 포함, Kiro 호출 3회). 주제 3까지 완료.
    - | 주제 | 회차 | 응답(ms) | JSON | 문장 | 질문 | 전환 | 출처 연결 문장 | 목표 충족 |
      |---|---|---|---|---|---|---|---|---|
      | 1 짧은 명사 | 1 | 22,838 | 성공 | 7 | 6 | 4 | 5 | 예 |
      | 2 긴 한국어 문장 | 1 | 22,477 | 성공 | 6 | 5 | 4 | 1 | 예 |
      | 3 영어 혼합 | 1 | 19,993 | 성공 | 6 | 5 | 4 | 4 | 예 |
    - 요약(3회): JSON 파싱 3/3, 목표 개수 충족 3/3, 응답 중앙값 22.5초·최대 22.8초, 평균 문장 6.3(출처 연결 3.3), 질문 5.3, 화제 전환 4.0.
    - 두 측정 합계(6회, 주제 3개 모두 포함): JSON 6/6, 목표 충족 6/6, 응답 20.0~28.0초(중앙값 22.7초).
    - _Requirements: 5.1_
  - [x] 6.2 기준선에 따라 `kiro-measure` 스킬의 조치 표대로 한 가지씩 조정하고 재측정
    - 판단: 조정하지 않음. 조치 표의 네 조건이 모두 해당하지 않는다.
      - JSON 파싱 실패: 0/6회. 출력 형식 강화 불필요(Req 6.1 조건 미발생).
      - 개수 미달: 0/6회. 개수 목표 위치 변경 불필요.
      - 응답 속도: 중앙값 22.7초로 기준 60초 미만. `SOURCE_CHARS` 1200 유지(Req 6.2 조건 미발생). `KIRO_TIMEOUT_MS` 120초는 최대 28.0초의 4배 이상이라 유지.
      - 출처 연결: 실행당 1~6문장(평균 3~4)으로 0에 가깝지 않음. `SUPPORT_MIN = 0.3` 유지. 주제 2(긴 문장)가 1~2문장으로 가장 낮지만 0은 아니어서 조치 대상이 아님.
    - 바꾼 것이 없어 재측정은 하지 않았다. 튜닝 전후 수치는 위 기준선과 같다.
    - _Requirements: 6.1, 6.2_
  - [ ] 6.3 전후 수치를 이 파일에 적고 C에게 BUILD_REPORT.md 갱신 요청
    - 이 파일에는 기록 완료(6.1, 6.2). C에게 BUILD_REPORT.md "Kiro CLI 실제 호출" 갱신 요청이 남음. 전달할 수치: 6회 중 JSON 6/6, 목표 충족 6/6, 응답 중앙값 22.7초(최대 28.0초), 튜닝 불필요.
    - _Requirements: 6.3_
- [x] 7. Kiro 개발 도구 통합
  - [x] 7.1 Hook 스크립트와 판단 로직 테스트(`scripts/hooks/`, `test/hooks/`)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - [x] 7.2 Hook 등록(`.kiro/hooks/*.json`)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - [x] 7.3 개발용 MCP 서버와 프로토콜 테스트(`scripts/mcp/`, `test/mcp/`)
    - _Requirements: 7.6_
  - [x] 7.4 steering, custom agents, skills, workflows 정리
    - _Requirements: 7.5_

- [ ] 8. Kiro 연결 표시, 오프라인 간이 모드 제거, 대화 맥락 반영
  - [x] 8.1 `checkKiro`(whoami)와 `resolveKiroCommand`(PATH 미갱신 시 기본 설치 위치), 자동 선택 시 Kiro 우선
    - 테스트 `test/ai/providers.test.js`
    - _Requirements: 8.1, 8.2, 8.3_
  - [x] 8.2 오프라인 간이 모드 제거(앱, `measure-kiro.js --offline`, MCP `offline_preview`). 테스트용 가짜 공급자는 `test/fixtures/fakeProvider.js`
    - _Requirements: 8.3_
  - [x] 8.3 창 하단 Kiro 연결 상태와 '다시 확인', 결과마다 실제 공급자 표시
    - 테스트 `test/core/service.test.js`
    - _Requirements: 8.1, 8.4_
  - [x] 8.4 프롬프트 맥락 파악 지침, `context` 필드, 일상 대화 기본, 후속 질문에 맥락 전달
    - 테스트 `test/ai/prompt.test.js`, `test/ai/schema.test.js`
    - _Requirements: 8.5, 8.6, 8.7_
  - [ ] 8.5 실제 Kiro로 일상 대화 입력 재측정(`node scripts/measure-kiro.js --runs 1`)과 문장 직접 확인
    - _Requirements: 5.1, 8.5_

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2", "3", "4"] },
    { "id": 1, "tasks": ["5.1", "5.2", "7.1", "7.3"] },
    { "id": 2, "tasks": ["7.2", "7.4", "6.1"] },
    { "id": 3, "tasks": ["6.2"] },
    { "id": 4, "tasks": ["6.3"] }
  ]
}
```

## Notes

- 6.x는 kiro-cli 로그인과 크레딧이 필요하다. 주제 3개 x 2회 = Kiro 호출 6회.
- 검증 명령: `node --test "test/**/*.test.js"`, `node scripts/check.js`, `node scripts/smoke.js`.
- `src/core/service.js` 이벤트 형식은 바꾸지 않았다.
