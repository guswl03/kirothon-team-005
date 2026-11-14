---
inclusion: fileMatch
fileMatchPattern: ["src/ai/**", "test/ai/**", "scripts/measure-kiro.js", "scripts/mcp/**"]
---
# AI·검색 모듈 지침 (B 담당)

## 파일별 책임
- `search.js`: 위키백과 검색. 원래 검색어 -> `keywordQuery`(조사·흔한 말 제거) -> 한국어 텍스트면 `latinQuery`로 영어 위키백과 순서로 시도한다. 출처가 `minSources`(기본 2)개 모이면 멈추고, 첫 요청에서 네트워크 오류가 나면 바로 `failed`를 반환한다.
- `prompt.js`: `header()`가 말투, 규칙, `<selected_text>`, `<user_note>`, `<sources>`를 만든다. 데이터는 전부 `escapeData`를 거친다. 출처 본문은 `SOURCE_CHARS`(1200)자까지만 넣는다.
- `schema.js`: `extractJson`(코드블록·머리말이 섞여도 첫 JSON 객체 추출), `normalizeResult`, `normalizeAnswers`. 출처는 ID 검증과 내용 검증(글자 2-gram 겹침 >= `SUPPORT_MIN` 0.3)을 모두 통과해야 남는다.
- `providers/kiro.js`: `kiro-cli chat --v3 --no-interactive`, 프롬프트는 stdin, `cwd`는 `os.tmpdir()/conversation-cheatsheet-kiro`. 타임아웃은 `KIRO_TIMEOUT_MS`(기본 120초).
- `providers/openai.js`: `CHEAT_LLM_BASE_URL`, `CHEAT_LLM_API_KEY`, `CHEAT_LLM_MODEL`. https 또는 localhost만 허용.
- `providers/offline.js`: 외부 전송 없이 검색 본문 문장만 인용한다. 사실을 지어내지 않는다.

## 목표 개수 (`schema.TARGETS`)
활용 문장 5개 이상, 예상 질문 5개 이상(각 답변 2개 이상), 화제 전환 3개 이상. 못 채우면 `shortfalls`로 알리고 지어내 채우지 않는다.

## 바꿀 때 지킬 것
- 반환 형식(`searchTopic`, `normalizeResult`)은 `src/core/service.js`와 렌더러가 쓰는 계약이다. 필드를 지우거나 이름을 바꾸지 않는다. 추가는 가능하다.
- 프롬프트를 바꾸면 `node scripts/measure-kiro.js --offline`으로 파이프라인을 확인하고, 가능하면 실제 Kiro로 `--runs 2` 실측한다.
- 테스트는 가짜 `fetchImpl`, 가짜 `spawnImpl`로 네트워크와 프로세스 없이 돌린다.
- 개발 중 확인은 MCP 서버 `cheatsheet-dev`의 `wiki_search`, `build_prompt`, `verify_result`, `support_score` 도구를 쓸 수 있다.

#[[file:.kiro/specs/ai-search-quality/requirements.md]]
