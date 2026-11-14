# Requirements Document

## Introduction

대화 치트키는 사용자가 다른 프로그램에서 선택한 텍스트를 바탕으로 관련 정보를 검색하고, 대화에서 바로 쓸 문장, 예상 질문별 답변, 화제 전환 문장을 제공하는 Windows 데스크톱 앱이다. 원문은 PRD.md이며 이 문서는 구현 범위와 검증 가능한 인수 기준으로 정리한 것이다.

## Glossary

- **App**: 대화 치트키 데스크톱 애플리케이션
- **Selection_Watcher**: Windows UI Automation으로 선택된 텍스트만 읽는 감지 모듈
- **Search_Module**: 위키백과 공개 API로 관련 정보와 출처를 수집하는 모듈
- **Provider**: 응답을 생성하는 AI 처리 방식(Kiro CLI 기본, OpenAI 호환 대체)
- **Service**: 검증, 검색, 생성, 정규화를 조율하는 파이프라인
- **Result_Window**: 결과를 보여주는 작은 창

## Requirements

### Requirement 1: 선택 텍스트 감지 및 실행

**User Story:** As a 일상·업무 대화 참여자, I want 텍스트를 선택하면 바로 분석이 시작되기를, so that 프로그램을 옮겨 다니지 않고 대화에 참여할 수 있다.

#### Acceptance Criteria

1. WHEN 자동 분석이 켜진 상태에서 사용자가 텍스트 선택을 완료하면, THE Selection_Watcher SHALL 선택된 텍스트를 읽어 Result_Window를 표시하고 분석을 시작한다.
2. IF 선택 내용이 비어 있거나 공백뿐이면, THEN THE Service SHALL 처리하지 않고 안내 메시지를 표시한다.
3. IF 선택 내용이 1500자를 초과하면, THEN THE App SHALL 처리하지 않고 길이와 조정 안내를 표시한다.
4. WHILE 포커스가 Result_Window 안에 있는 동안, THE App SHALL 그 안의 텍스트 선택으로 새 분석을 시작하지 않는다.
5. WHEN 동일한 텍스트가 4초 이내에 다시 선택되면, THE App SHALL 중복 요청을 만들지 않는다.
6. THE App SHALL 자동 분석을 일시 중지하고 다시 켜는 수단을 창과 트레이 메뉴에 제공한다.
7. IF 자동 감지가 불가능하면, THEN THE App SHALL 붙여넣기 입력과 클립보드 분석 단축키(Ctrl+Alt+Space)로 같은 흐름을 제공한다.

### Requirement 2: 주제 파악 및 정보 수집

**User Story:** As a 낯선 주제를 만난 사용자, I want 관련 정보와 출처를 함께 보기를, so that 확인된 내용으로 대화할 수 있다.

#### Acceptance Criteria

1. WHEN 분석이 시작되면, THE Search_Module SHALL 선택 텍스트로 관련 자료를 검색하고 출처명, 링크, 확인 시점을 반환한다.
2. IF 검색 결과가 충분하지 않으면, THEN THE App SHALL 부족한 상태를 표시한다.
3. IF 검색이 실패하면, THEN THE App SHALL 실패 상태를 표시하고 확인되지 않은 내용을 출처 있는 정보로 표시하지 않는다.
4. WHERE 사용자가 맥락을 입력하면, THE Search_Module SHALL 그 맥락을 검색어에 반영한다.

### Requirement 3: 아는 척 문장 생성

**User Story:** As a 대화 참여자, I want 바로 말할 수 있는 짧은 문장 여러 개를, so that 상황에 맞게 골라 쓸 수 있다.

#### Acceptance Criteria

1. WHEN 정보가 충분하면, THE Provider SHALL 서로 다른 방향의 문장 5개 이상을 생성한다.
2. WHERE 사용자가 말투를 선택하면, THE Service SHALL 일상 대화 또는 업무 대화 말투를 반영한다.
3. THE Service SHALL 사용자의 개인 경험, 직업, 자격을 지어내지 않도록 Provider에 지시한다.
4. WHEN 사용자가 특정 문장의 다시 만들기를 요청하면, THE Service SHALL 그 문장만 기존 항목과 다른 내용으로 교체한다.

### Requirement 4: 예상 질문 및 답변

**User Story:** As a 대화 참여자, I want 상대의 예상 질문과 답변 후보를, so that 추가 질문에도 막히지 않는다.

#### Acceptance Criteria

1. WHEN 정보가 충분하면, THE Provider SHALL 예상 질문 5개 이상을 생성하고 각 질문에 서로 다른 답변 2개 이상을 제공한다.
2. THE Result_Window SHALL 예상 질문을 AI 추정으로 표시한다.
3. IF 목표 개수를 채울 수 없으면, THEN THE Service SHALL 부족한 항목을 알리고 내용을 지어내 채우지 않는다.

### Requirement 5: 실제 후속 질문 대응

**User Story:** As a 대화 참여자, I want 실제로 받은 질문을 입력해 답을 받기를, so that 대화를 이어갈 수 있다.

#### Acceptance Criteria

1. WHEN 사용자가 후속 질문을 입력하면, THE Service SHALL 기존 주제, 자료, 말투를 유지해 답변을 여러 개 생성한다.
2. IF 답변을 만들 정보가 부족하면, THEN THE Service SHALL 부족 상태를 표시하고 단정하지 않는다.
3. IF 질문이 비어 있으면, THEN THE Service SHALL 요청을 거부한다.

### Requirement 6: 화제 전환

**User Story:** As a 대화 참여자, I want 자연스럽게 화제를 바꾸는 문장을, so that 부담스러운 주제에서 벗어날 수 있다.

#### Acceptance Criteria

1. WHEN 정보가 충분하면, THE Provider SHALL 서로 다른 전환 방향 3개 이상과 각각의 전환 문장을 생성한다.
2. WHERE 사용자가 선호 방향을 입력하면, THE Service SHALL 그 방향을 프롬프트에 반영한다.

### Requirement 7: 결과 표시 및 활용

**User Story:** As a 사용자, I want 결과를 구분해서 보고 개별 복사하기를, so that 필요한 문장만 골라 쓸 수 있다.

#### Acceptance Criteria

1. THE Result_Window SHALL 가장 위에 바로 쓸 문장을 표시한다.
2. THE Result_Window SHALL 문장, 예상 질문, 화제 전환, 핵심 정보와 출처를 구분해 표시한다.
3. WHEN 사용자가 복사를 누르면, THE App SHALL 해당 문장만 클립보드에 복사한다.
4. THE App SHALL 생성 결과를 다른 프로그램에 자동 입력하거나 전송하지 않는다.
5. THE Result_Window SHALL 화면 작업 영역 밖으로 나가지 않도록 위치를 보정한다.

### Requirement 8: 처리 상태와 오류

**User Story:** As a 사용자, I want 진행과 실패 상태를 알기를, so that 기다리거나 다시 시도할 수 있다.

#### Acceptance Criteria

1. WHILE 검색 중이면, THE Result_Window SHALL 검색 중 상태를 표시하고, WHILE 생성 중이면 생성 중 상태를 표시한다.
2. IF 검색 또는 생성이 실패하면, THEN THE Result_Window SHALL 오류와 다시 시도 버튼을 표시한다.
3. WHEN 처리 중 새 텍스트가 선택되면, THE Service SHALL 이전 요청을 취소하고 이전 요청의 결과를 표시하지 않는다.

### Requirement 9: 정확성과 개인정보

**User Story:** As a 사용자, I want 내 선택 내용이 안전하게 다뤄지기를, so that 안심하고 자동 분석을 켤 수 있다.

#### Acceptance Criteria

1. WHEN 자동 분석을 처음 켜면, THE App SHALL 선택 내용이 검색과 AI 처리에 쓰인다는 점과 외부 전송 여부를 안내하고 동의를 받는다.
2. THE Selection_Watcher SHALL 선택된 텍스트만 읽고 전체 화면, 문서, 클립보드를 수집하지 않는다.
3. THE Selection_Watcher SHALL 비밀번호 입력란을 처리 대상에서 제외한다.
4. THE App SHALL 선택 텍스트와 생성 결과를 파일로 저장하거나 로그에 남기지 않는다.
5. THE Service SHALL 검색 결과에 없는 출처 ID를 모델이 만들어도 제거하고 출처 없는 문장을 일반 표현으로 표시한다.

### Requirement 10: AI 공급자 연동

**User Story:** As a 팀, I want Kiro 연동 가능 여부와 무관하게 앱이 동작하기를, so that 시연이 중단되지 않는다.

#### Acceptance Criteria

1. WHERE kiro-cli 로그인 세션이나 KIRO_API_KEY가 있으면, THE App SHALL Kiro CLI 비대화형 모드를 기본 Provider로 사용한다.
2. WHERE Kiro가 연결되지 않았고 OpenAI 호환 설정이 있으면, THE App SHALL 해당 Provider를 대체 경로로 사용한다.
3. IF 사용할 수 있는 AI가 없으면, THEN THE App SHALL 문장을 만들지 않고 Kiro 연결 상태와 연결 방법을 표시한다. (오프라인 간이 모드는 제거했다. 상세는 `.kiro/specs/ai-search-quality` Requirement 8)
4. THE App SHALL Kiro 구독이 서비스용 모델 API를 제공한다고 가정하지 않는다.