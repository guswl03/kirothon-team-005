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
  - [x] 5.1 측정·요약·`--offline` 모드 (커밋 `b15c480`)
    - _Requirements: 5.1, 5.2, 5.4_
  - [x] 5.2 kiro-cli 로그인 세션 인정(`kiro-cli whoami`)과 미준비 시 종료 코드 2
    - _Requirements: 5.3, 5.5_
- [ ] 6. 실측 기반 프롬프트 튜닝
  - [ ] 6.1 kiro-cli 로그인 후 `node scripts/measure-kiro.js --runs 2`로 기준선 측정
    - 사용자가 kiro-cli를 설치하고 로그인해야 한다(`.kiro/steering/kiro-cli-measure.md`).
    - _Requirements: 5.1_
  - [ ] 6.2 기준선에 따라 `kiro-measure` 스킬의 조치 표대로 한 가지씩 조정하고 재측정
    - _Requirements: 6.1, 6.2_
  - [ ] 6.3 전후 수치를 이 파일에 적고 C에게 BUILD_REPORT.md 갱신 요청
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
