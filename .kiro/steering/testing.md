---
inclusion: fileMatch
fileMatchPattern: ["test/**", "**/*.test.js"]
---
# 테스트 작성 지침

- `node:test`의 `test()`와 `node:assert/strict`만 쓴다. 테스트 이름은 한국어로 동작을 설명한다("결과가 없으면 insufficient").
- 네트워크, 프로세스, 시간은 주입한다: `fetchImpl`, `spawnImpl`, `now`, `getCwd`. 실제 위키백과나 kiro-cli를 부르지 않는다(그건 smoke와 measure-kiro가 맡는다).
- 실패 경로를 같이 검증한다: 네트워크 오류, HTTP 오류, 취소(AbortError), 잘못된 JSON, 빈 입력.
- 보안 규칙은 공격 입력으로 검증한다: 구분자 탈출(`</selected_text>`), 가짜 출처 ID, 출처와 무관한 문장.
- 비밀값 패턴을 테스트에 넣어야 하면 문자열을 조합해서 만든다(`['sk', 'proj', 'A'.repeat(24)].join('-')`). `guard-write` Hook이 실제 키 모양을 막는다.
- 정확성 속성(design.md의 Property 1~5)은 `test/core/properties.test.js`처럼 여러 입력으로 검증한다.
