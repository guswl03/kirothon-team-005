---
inclusion: always
---
# 프로젝트 구조

```text
src/
  main/        Electron 메인: 창, 트레이, 단축키, 설정, IPC, 선택 감지 프로세스 관리
  native/      selection.ps1 (UI Automation 폴링, 비밀번호 입력란 제외)
  core/        Electron 비의존 파이프라인: service(검증 -> 검색 -> 생성 -> 정규화), textGuard
  ai/          search(위키백과), prompt(프롬프트), schema(정규화·출처 검증), providers/(kiro, openai)
  renderer/    결과 창 UI (textContent만 사용, CSP)
test/          ai/ core/ desktop/ hooks/ mcp/  -- src와 같은 이름으로 짝을 맞춘다
scripts/       check.js, smoke.js, measure-kiro.js, make-pdf.js
  hooks/       Kiro Hook 스크립트 (.kiro/hooks/*.json이 호출)
  mcp/         개발용 MCP 서버 cheatsheet-dev
.kiro/
  steering/    항상/조건부 지침
  specs/       conversation-cheatsheet(제품), ai-search-quality(B 작업)
  hooks/ agents/ skills/ workflows/
docs/          팀 작업, 보안 검토, Kiro 활용 정리, 발표
```

## 의존 방향
`main` -> `core` -> `ai`. `ai`와 `core`는 Electron을 require하지 않는다. 그래서 Node만으로 테스트할 수 있다.
`renderer`는 preload가 노출한 API로만 main과 통신한다.

## 계약
- Provider: `generate({ prompt, signal, ctx, kind, avoid?, question? }) -> Promise<string>`. 반환 문자열은 `schema.extractJson`이 읽을 수 있어야 한다.
- 검색: `searchTopic(text, opts) -> { status: ok|insufficient|failed, query, sources[{id,name,title,url,extract,retrievedAt}], retrievedAt, attempts?, error? }`.
- 서비스 이벤트(`start`, `stage`, `sources`, `result`, `error`, `regenerating`, `regenerated`, `followup-*`, `invalid`)는 B와 C의 계약이다. 바꾸려면 먼저 합의한다.

#[[file:.kiro/specs/conversation-cheatsheet/design.md]]
