# Requirements Document

## Introduction

대화 치트키의 Windows 데스크톱 통합(선택 감지, 결과 창, 패키징)을 시연 환경에서 안정적으로 동작하게 만든다. 이 스펙은 담당 A의 작업 범위(`src/main`, `src/native`, `test/desktop`)만 다룬다.

## Glossary

- **Selection_Watcher**: UI Automation으로 선택된 텍스트를 읽는 PowerShell 헬퍼와 이를 관리하는 모듈
- **Probe**: 텍스트 내용 없이 감지 가능 여부만 측정하는 진단 도구
- **Result_Window**: 결과를 보여주는 작은 창
- **Unsupported_Control**: TextPattern을 제공하지 않아 선택을 읽을 수 없는 컨트롤

## Requirements

### Requirement 1: 호환성 측정

**User Story:** As a 데스크톱 담당자, I want 프로그램별 감지 가능 여부를 빠르게 기록하기를, so that 시연 대상과 대체 경로를 결정할 수 있다.

#### Acceptance Criteria

1. WHEN 사용자가 `npm run compat`을 실행하면, THE Probe SHALL 포커스된 컨트롤의 프로세스 이름, 클래스, TextPattern 지원 여부, 선택 길이를 출력한다.
2. THE Probe SHALL 선택된 텍스트의 내용을 출력하거나 저장하지 않는다.
3. THE Probe SHALL 비밀번호 입력란에서는 지원 여부만 출력한다.
4. THE Probe SHALL 결과를 `docs/COMPATIBILITY.md`에 붙여 넣을 수 있는 표 한 줄 형식으로 출력한다.

### Requirement 2: 감지 속도와 정확도

**User Story:** As a 사용자, I want 선택 직후 빠르게 결과 창이 뜨기를, so that 대화 흐름을 놓치지 않는다.

#### Acceptance Criteria

1. THE Selection_Watcher SHALL 폴링 간격과 안정 확인 횟수를 설정값으로 제공한다.
2. WHEN 같은 선택이 안정 횟수만큼 유지되면, THE Selection_Watcher SHALL 선택을 한 번만 전달한다.
3. WHILE 선택이 비어 있는 동안, THE Selection_Watcher SHALL 아무것도 전달하지 않는다.
4. WHEN 출력 한 줄이 JSON이 아니거나 필수 필드가 없으면, THE Selection_Watcher SHALL 그 줄을 무시한다.

### Requirement 3: 미지원 상황 안내

**User Story:** As a 사용자, I want 자동 감지가 안 되는 프로그램에서 그 사실을 알기를, so that 대체 경로를 바로 쓸 수 있다.

#### Acceptance Criteria

1. IF 포커스된 컨트롤이 TextPattern을 제공하지 않으면, THEN THE Selection_Watcher SHALL 텍스트 없이 미지원 상태만 보고한다.
2. WHEN 미지원 상태가 보고되면, THE App SHALL 동일한 프로그램에 대해 한 번만 대체 경로(`Ctrl+Alt+Space`, 붙여넣기) 안내를 표시한다.
3. THE App SHALL 미지원 안내에 선택 텍스트나 프로그램 창 제목을 포함하지 않는다.

### Requirement 4: 결과 창 배치와 포커스

**User Story:** As a 사용자, I want 결과 창이 어떤 모니터에서도 화면 안에 보이고 작업을 방해하지 않기를, so that 하던 일을 이어서 할 수 있다.

#### Acceptance Criteria

1. THE Result_Window SHALL 커서가 있는 모니터의 작업 영역 안에 배치된다.
2. WHERE 모니터 좌표가 음수이거나 작업 표시줄이 상하좌우 어디에 있어도, THE Result_Window SHALL 작업 영역 안에 배치된다.
3. WHEN 자동 감지로 창이 표시되면, THE Result_Window SHALL 포커스를 가져가지 않는다.
4. WHILE 포커스가 Result_Window에 있는 동안, THE App SHALL 그 안의 선택으로 새 분석을 시작하지 않는다.

### Requirement 5: 패키징

**User Story:** As a 팀, I want 설치 없이 실행되는 exe를, so that 시연 PC에서 바로 실행할 수 있다.

#### Acceptance Criteria

1. WHEN `npm run dist`를 실행하면, THE build SHALL Windows portable exe를 생성한다.
2. THE packaged app SHALL `selection.ps1`을 asar 밖의 경로에서 실행한다.
3. WHEN 패키징된 exe를 스모크 모드로 실행하면, THE packaged app SHALL 분석 흐름을 완료한다.

### Requirement 6: 개인정보와 기록

**User Story:** As a 사용자, I want 선택 내용이 진단 과정에서도 남지 않기를, so that 안심하고 쓸 수 있다.

#### Acceptance Criteria

1. THE App SHALL 선택 텍스트를 로그, 파일, 콘솔, 오류 메시지에 남기지 않는다.
2. THE Probe SHALL 진단 출력에 길이와 컨트롤 종류만 포함한다.
3. WHEN `npm run check`를 실행하면, THE check SHALL PowerShell 헬퍼와 메인 프로세스의 위험 패턴을 점검한다.