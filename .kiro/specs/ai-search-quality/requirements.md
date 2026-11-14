# Requirements Document

## Introduction

B 역할(AI·검색)의 품질 개선 범위다. 제품 요구사항은 `.kiro/specs/conversation-cheatsheet/requirements.md`(이하 제품 명세)에 있고, 이 문서는 그중 Requirement 2(정보 수집), 3·4·6(생성 개수), 9.5(출처 검증), 10(AI 공급자)을 실제 사용 환경에서 더 잘 만족시키기 위한 요구사항을 정리한다. `BUILD_REPORT.md`가 남긴 미검증 항목("Kiro CLI 실제 호출: 출력 JSON 준수율과 응답 시간은 미측정")을 해소하는 것도 포함한다.

## Glossary

- **Search_Module**: `src/ai/search.js`
- **Prompt_Builder**: `src/ai/prompt.js`
- **Normalizer**: `src/ai/schema.js`의 `normalizeResult`, `normalizeAnswers`
- **Kiro_Provider**: `src/ai/providers/kiro.js`
- **Support_Score**: 문장의 글자 2-gram 중 출처 본문에도 있는 비율(0~1)
- **Measure_Script**: `scripts/measure-kiro.js`

## Requirements

### Requirement 1: Kiro CLI 실행 격리

**User Story:** As a 개발자, I want Kiro CLI가 앱 프롬프트만 처리하기를, so that 저장소의 개발용 설정이 사용자 결과에 섞이지 않는다.

#### Acceptance Criteria

1. THE Kiro_Provider SHALL 저장소가 아닌 OS 임시 폴더 아래의 앱 전용 폴더를 작업 폴더로 kiro-cli를 실행한다.
2. THE Kiro_Provider SHALL 프롬프트를 stdin으로만 전달하고 셸과 도구 신뢰 옵션을 쓰지 않는다.
3. WHERE `KIRO_TIMEOUT_MS`가 1000 이상의 숫자로 설정되면, THE Kiro_Provider SHALL 그 값을 타임아웃으로 쓰고, 잘못된 값이면 기본값 120000ms를 쓴다.
4. WHEN 타임아웃이 지나면, THE Kiro_Provider SHALL 프로세스를 종료하고 시간 초과 오류를 반환한다.

### Requirement 2: 프롬프트 데이터 구분자 보호

**User Story:** As a 사용자, I want 선택한 텍스트 안의 문구가 앱의 지시를 바꾸지 못하기를, so that 악의적인 웹페이지 문구를 선택해도 안전하다.

#### Acceptance Criteria

1. THE Prompt_Builder SHALL 선택 텍스트, 사용자 메모, 출처 이름과 본문, 후속 질문, 선호 방향, 중복 금지 목록의 `&`, `<`, `>`, `"`를 엔티티로 바꾼다.
2. WHEN 선택 텍스트에 `</selected_text>`가 들어 있으면, THE Prompt_Builder SHALL 프롬프트의 닫는 `</selected_text>` 태그를 정확히 하나만 남긴다.
3. THE Prompt_Builder SHALL 출처 본문을 출처당 `SOURCE_CHARS`자까지만 넣는다.

### Requirement 3: 검색 보강

**User Story:** As a 긴 문장을 선택한 사용자, I want 관련 자료가 찾아지기를, so that 출처 있는 정보로 대화할 수 있다.

#### Acceptance Criteria

1. WHEN 원래 검색어의 결과가 `minSources`(기본 2)개 미만이면, THE Search_Module SHALL 조사와 흔한 말을 뺀 핵심 단어 검색어로 다시 검색한다.
2. WHEN 한국어 텍스트의 결과가 여전히 부족하고 텍스트에 영어 단어가 있으면, THE Search_Module SHALL 영어 단어로 영어 위키백과를 검색한다.
3. THE Search_Module SHALL 여러 단계의 결과를 URL 기준으로 중복 없이 합치고 출처 ID를 `S1`부터 다시 매긴다.
4. IF 첫 요청이 네트워크 오류로 실패하면, THEN THE Search_Module SHALL 더 시도하지 않고 `failed`를 반환한다.
5. IF 뒤 단계 요청이 실패하면, THEN THE Search_Module SHALL 이미 찾은 출처로 `ok`를 반환한다.
6. WHEN 사용자가 요청을 취소하면, THE Search_Module SHALL `AbortError`를 그대로 전달한다.
7. THE Search_Module SHALL 반환 필드(`status`, `query`, `sources`, `retrievedAt`, `error`)를 유지한다.

### Requirement 4: 출처 내용 검증

**User Story:** As a 사용자, I want 출처 표시가 붙은 문장은 실제로 그 출처에 근거하기를, so that 출처를 믿고 말할 수 있다.

#### Acceptance Criteria

1. WHEN 항목이 출처 ID를 인용하면, THE Normalizer SHALL 출처 본문과의 Support_Score가 `SUPPORT_MIN`(0.3) 미만인 ID를 제거한다.
2. IF 문장의 출처 ID가 모두 제거되면, THEN THE Normalizer SHALL 그 문장을 `general`로 표시한다.
3. IF 핵심 정보의 출처 ID가 모두 제거되면, THEN THE Normalizer SHALL 그 핵심 정보를 노출하지 않는다.
4. THE Normalizer SHALL 활용 문장, 예상 질문 답변, 화제 전환, 핵심 정보, 후속 답변에 같은 검증을 적용한다.
5. THE Normalizer SHALL 출처 문장을 그대로 인용한 문장을 강등하지 않는다.
6. WHERE 출처에 본문이 없으면, THE Normalizer SHALL ID 검증만 적용한다.

### Requirement 5: Kiro CLI 실측

**User Story:** As a 팀, I want Kiro CLI의 실제 응답 시간과 JSON 준수율을 알기를, so that 시연에서 Kiro를 기본 공급자로 쓸지 판단할 수 있다.

#### Acceptance Criteria

1. THE Measure_Script SHALL 고정된 예시 주제로 전체 생성 프롬프트를 지정한 횟수만큼 실행하고, 응답 시간, JSON 파싱 성공률, 목표 개수 충족률, 평균 개수를 출력한다.
2. THE Measure_Script SHALL 생성된 문장과 검색 본문을 출력하거나 저장하지 않는다.
3. IF kiro-cli를 실행할 수 없거나 인증 정보가 없으면, THEN THE Measure_Script SHALL 이유를 안내하고 종료 코드 2로 끝낸다.
4. (삭제) 오프라인 간이 모드는 제품에서 제거했다. 측정은 Kiro CLI로만 한다.
5. WHEN kiro-cli 로그인 세션이 있으면, THE Measure_Script SHALL `KIRO_API_KEY` 없이도 측정한다.

### Requirement 6: 실측 기반 프롬프트 튜닝

**User Story:** As a 사용자, I want 결과가 빠르고 목표 개수를 채우기를, so that 대화 중에 바로 쓸 수 있다.

#### Acceptance Criteria

1. WHEN 실측에서 JSON 파싱 실패가 나오면, THE Prompt_Builder SHALL 출력 형식 지시를 강화하고 실패한 출력 모양을 테스트로 남긴다.
2. WHEN 실측에서 응답 시간 중앙값이 60초를 넘으면, THE Prompt_Builder SHALL 출처 분량을 줄인 뒤 다시 측정한다.
3. THE 팀 SHALL 튜닝 전후 수치를 tasks.md와 BUILD_REPORT.md에 남긴다.

### Requirement 7: Kiro 개발 도구 통합

**User Story:** As a 팀원, I want Kiro가 팀 규칙과 검증을 자동으로 지키기를, so that 역할이 나뉜 상태에서도 충돌과 사고가 줄어든다.

#### Acceptance Criteria

1. WHEN 에이전트가 되돌리기 어려운 git 명령이나 범위 밖 재귀 삭제를 실행하려 하면, THE Hook SHALL 실행을 차단한다.
2. WHEN 에이전트가 비밀값이나 `.env`를 쓰려 하면, THE Hook SHALL 쓰기를 차단하고 값 자체는 출력하지 않는다.
3. WHEN 에이전트가 공유 영역이나 다른 역할 소유 파일을 쓰려 하면, THE Hook SHALL 사용자 확인을 요청한다.
4. WHEN 소스 파일이 저장되면, THE Hook SHALL 그 영역의 테스트와 보안 정적 점검을 실행한다.
5. WHEN 세션이 시작되거나 대화가 압축되면, THE Hook SHALL 브랜치 역할, 공유 영역 규칙, 남은 spec 작업을 컨텍스트에 넣는다.
6. THE MCP 서버 SHALL 앱의 실제 모듈로 검색, 프롬프트 생성, 출처 검증, 상태 확인 도구를 제공한다.

### Requirement 8: Kiro 연결 표시와 대화 맥락 반영

**User Story:** As a 일상 대화 중인 사용자, I want Kiro가 연결됐는지와 결과를 무엇이 만들었는지 알고, 결과가 지금 대화 맥락에 맞기를, so that 어색한 문장 없이 바로 대화에 끼어들 수 있다.

#### Acceptance Criteria

1. WHEN 앱이 시작되거나 사용자가 '다시 확인'을 누르면, THE App SHALL `kiro-cli whoami`로 Kiro 연결 상태(연결됨, 미설치, 로그인 필요, 확인 실패)를 확인해 창에 표시한다. 계정 정보는 표시하거나 저장하지 않는다.
2. WHEN 공급자가 자동 선택이면, THE App SHALL 로그인 세션이나 `KIRO_API_KEY`가 있으면 Kiro를 쓴다.
3. IF Kiro가 미설치이거나 로그인되지 않았으면, THEN THE App SHALL 생성하지 않고 연결 방법을 오류로 안내한다. 대체 문장을 만들지 않는다.
4. THE App SHALL 결과마다 실제로 호출한 공급자를 표시한다.
5. THE Prompt_Builder SHALL 선택 텍스트가 나온 대화 상황과 의도를 먼저 파악하게 하고(context), 상대의 말을 사용자의 말처럼 되풀이하지 않으며, 맥락과 무관하거나 분위기에 맞지 않는 출처를 쓰지 않게 한다.
6. THE Prompt_Builder SHALL 일상 대화(친구·지인과의 메신저, 모임)를 기본 상황으로 둔다.
7. WHEN 후속 질문에 답할 때, THE Prompt_Builder SHALL 파악한 맥락을 함께 넣는다.
