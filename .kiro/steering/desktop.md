---
inclusion: fileMatch
fileMatchPattern: ["src/main/**", "src/native/**", "test/desktop/**"]
---
# 데스크톱 통합 지침 (A 담당)

- 선택 감지는 `src/native/selection.ps1`이 UI Automation `TextPattern`으로 선택 영역만 읽는다. 전체 문서, 화면, 클립보드는 읽지 않는다. 비밀번호 입력란은 제외한다.
- 클립보드는 사용자가 `Ctrl+Alt+Space`를 눌렀을 때만 읽는다.
- 결과 창 안에서 생긴 선택은 새 분석을 시작하지 않는다. 같은 텍스트는 4초 안에 다시 처리하지 않는다(`createDedupe(4000)`).
- 창 위치는 작업 영역 밖으로 나가지 않게 보정한다(`windowPlacement.js`, Property 5).
- IPC는 `event.sender`를 확인하고, preload는 화이트리스트 API만 노출한다. IPC 채널을 추가하면 main.js, preload.js, renderer.js를 한 PR로 묶는다.
- `scripts/check.js`가 `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `setPermissionRequestHandler`를 main.js에서 검사한다. 이 옵션을 지우지 않는다.
- 공급자 자동 선택(`auto`)은 Kiro(로그인 세션 또는 `KIRO_API_KEY`)가 기본이다. Kiro가 연결되지 않았고 OpenAI 호환 설정이 있을 때만 OpenAI 호환을 쓴다. 오프라인 간이 모드는 없다. 연결 상태는 시작 시와 '다시 확인'(`check-kiro` IPC)에서 `checkKiro()`로 확인해 창 하단에 표시한다.
- 남은 작업: 시연 PC에서 메모장, 브라우저 등 대상별 선택 감지 실측(spec 5.3).
