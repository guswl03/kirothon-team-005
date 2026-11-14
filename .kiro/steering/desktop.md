---
inclusion: fileMatch
fileMatchPattern: ["src/main/**", "src/native/**", "test/desktop/**"]
---
# 데스크톱 통합 지침 (A 담당)

## 개인정보
- 선택 텍스트는 로그, 파일, 콘솔, 오류 메시지에 남기지 않는다. 진단 출력에는 길이와 컨트롤 종류만 쓴다.
- 선택 감지는 `src/native/selection.ps1`이 UI Automation `TextPattern`으로 선택 영역만 읽는다. 순서는 포커스된 컨트롤, 드래그가 끝났으면 커서 아래 요소(상위 10단계, 같은 프로세스 안)다. 전체 문서와 화면은 읽지 않는다.
- 비밀번호 입력란(`IsPassword`)은 항상 건너뛴다.
- 클립보드는 두 경우에만 쓴다. (1) 사용자가 `Ctrl+Alt+Space`를 눌렀을 때 읽기. (2) 사용자가 동의하고 켠 '메신저 드래그 복사'(`copyFallback`, 기본 꺼짐. 자동 분석을 켤 때 함께 묻고, '다시 묻지 않기'면 `copyFallbackNoAsk`. 트레이 메뉴에서도 켜고 끈다): UI Automation이 실패한 드래그가 허용 메신저(`COPY_APPS`: 카카오톡·디스코드)에서 끝났을 때만 Ctrl+C를 한 번 보내 읽고 원래 클립보드로 되돌린다.
- 복사 대체 경로는 주기적 폴링에서 절대 실행하지 않는다. 터미널·편집기처럼 Ctrl+C가 다른 뜻인 앱은 허용 목록에 넣지 않는다. 전면 창과 커서 아래 앱이 같은 허용 앱이고 수정키를 누르지 않았을 때만 키를 보낸다. 되돌릴 수 없는 클립보드 형식이 있으면 복사하지 않는다.
- 미지원 안내(`type: unsupported`)에는 선택 텍스트와 창 제목을 싣지 않는다.

## 동작
- 외부 프로세스는 `shell: false`와 인자 배열, 시스템 PowerShell 절대 경로로 실행한다.
- 결과 창은 포커스를 가져가지 않고 표시한다(`showInactive`). 사용자가 직접 연 경우만 포커스를 준다.
- 창 위치는 커서가 있는 모니터의 작업 영역 안으로 보정한다(`windowPlacement.js`). 창이 영역보다 크면 영역 크기로 제한한다.
- 결과 창 안에서 생긴 선택은 새 분석을 시작하지 않는다. 같은 텍스트는 4초 안에 다시 처리하지 않는다(`createDedupe(4000)`).

- 자동 감지가 안 되는 프로그램은 프로세스당 한 번만 대체 경로(복사 후 `Ctrl+Alt+Space`, 붙여넣기)를 안내한다.
- 동의는 공급자별이다(`consentProvider`, `needsConsent`). 동의 때 안내한 곳과 다른 공급자로 바뀌면 확인 창으로 다시 동의를 받고, 자동 분석 중 공급자가 바뀌면 자동 분석을 멈춘다. 예전(오프라인 간이 모드 시절) 동의는 인정하지 않는다.

## 보안 옵션과 IPC
- IPC는 `event.sender`를 확인하고, preload는 화이트리스트 API만 노출한다.
- IPC 채널을 추가하면 `main.js`, `preload.js`, `renderer.js`가 함께 바뀐다. 렌더러는 C 담당이므로 한 PR로 묶는다.
- `scripts/check.js`가 `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `setPermissionRequestHandler`를 main.js에서 검사하고, PowerShell 헬퍼의 파일 쓰기·콘솔 출력·비밀번호 제외 규칙과, 키 입력·클립보드 읽기가 `Invoke-CopyFallback`/`Backup-Clipboard` 안에서만 허용 확인 뒤에 일어나는지도 검사한다. 이 옵션과 규칙을 지우지 않는다.
- 공급자 자동 선택(`auto`)은 Kiro(로그인 세션 또는 `KIRO_API_KEY`)가 기본이다. Kiro가 연결되지 않았고 OpenAI 호환 설정이 있을 때만 OpenAI 호환을 쓴다. 오프라인 간이 모드는 없다. 연결 상태는 시작 시와 '다시 확인'(`check-kiro` IPC)에서 `checkKiro()`로 확인해 창 하단에 표시한다.

## 범위와 검증
- 수정 범위는 `src/main/`, `src/native/`, `test/desktop/`이다. 그 밖은 담당자와 먼저 합의한다.
- 변경 후 `npm test`, `npm run check`, `npm run smoke`를 실행한다.
- 호환성 실측 결과는 `docs/COMPATIBILITY.md`에 기록한다(`npm run compat`).
