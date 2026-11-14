# 자동 선택 감지의 "미지원 안내", 드래그 감지, 창 배치 보정 변경 검토

범위는 `src/main/*`, `src/native/selection.ps1`, `scripts/compat.js`, `scripts/compat-probe.ps1`, `test/desktop/*`의 로컬 작업 트리 변경이다(기준: `git diff`, 커밋 `8b2c50d`). 코드는 수정하지 않았고 `npm test`만 실행했다(53개 통과). `npm run check`, `npm run smoke`는 실행하지 않았다.

이번 변경은 PowerShell 헬퍼에 마우스 드래그 감지(`GetAsyncKeyState`)를 넣고, 드래그가 끝났는데 포커스 컨트롤에 TextPattern이 없으면 `{"type":"unsupported"}`를 한 번 보내 결과 창에 대체 경로를 안내한다. 같은 변경에 폴링 간격 인자, 창 크기 상한 보정, 호환성 측정 스크립트가 들어 있다. 선택 텍스트나 창 제목이 새는 경로는 찾지 못했고, 비밀번호 제외도 새 경로에서 지켜진다. 문제는 드래그 판정의 정확도와 안내 문구에 있다.

Watch for: 창을 옮기거나 파일을 끌기만 해도 미지원 안내가 뜬다(confirmed). 안내 문구가 실제 단축키 동작과 다르다(confirmed). 왼손잡이 마우스 설정에서 드래그 감지가 반대로 동작한다(likely).

**Verdict**: NEEDS_CHANGES

## High-level view

미지원 안내는 "왼쪽 버튼을 8px 이상 끌었다 뗐고 포커스 컨트롤에 TextPattern이 없다"는 조건 하나로 발동한다. 이 조건은 텍스트 선택과 무관한 드래그(창 이동, 파일 끌기, 슬라이더)를 구분하지 못하고, 반대로 350ms 폴링에 걸리지 않는 짧은 드래그는 놓친다. 선택 텍스트 자체는 드래그 여부와 상관없이 읽히는데, 이는 기존 동작이지만 동의 문구의 "드래그로 선택한 텍스트만"과 어긋난다.

프라이버시 쪽은 안정적이다. 헬퍼는 미지원 메시지에 프로세스 ID와 이름만 담고, 메인 쪽 `parseLine`은 알려진 필드만 복사하며, 안내 문구는 고정 문자열이다. 비밀번호 판정은 미지원 보고보다 먼저 일어난다.

헬퍼 실행은 `shell: false`와 인자 배열을 쓰고 숫자 인자는 정수로 보정된다. 남은 위험은 `powershell.exe`를 이름만으로 찾는 점이다. 창 배치는 작업 영역보다 큰 창을 처리하지만, 줄인 크기가 창에 그대로 남는다. 새 로직의 핵심(PowerShell 드래그 판정, `onUnsupported`)에는 테스트가 없다.

<details>
<summary>Issues (13)</summary>

심각도 순이다. 파일:줄은 작업 트리 기준이다.

1. **[중간] 텍스트와 무관한 드래그에서 미지원 안내** (confirmed) — `selection.ps1:68`. 창 제목 줄 이동, 탐색기 파일 끌기, 슬라이더 조작처럼 TextPattern이 없는 컨트롤에서 끝나는 모든 드래그가 안내를 띄운다. 마우스 아래 요소가 텍스트 입력류인지, 또는 직전 클릭 위치의 요소가 선택 가능한지 확인한 뒤에만 보고한다.
2. **[중간] 안내 문구가 단축키 동작과 다름** (confirmed) — `main.js:153`. 단축키는 `analyzeClipboard`(`main.js:157`)로 연결되어 클립보드만 읽는다. "선택한 뒤 단축키"는 동작하지 않고, 이전에 복사해 둔 내용을 분석할 수 있다. "복사(Ctrl+C)한 뒤"로 고친다.
3. **[중간] 왼손잡이 버튼 설정에서 드래그 판정 반전** (likely) — `selection.ps1:37`. `GetAsyncKeyState(1)`은 논리 버튼이 아니라 물리 왼쪽 버튼을 본다(Win32 문서). 버튼을 바꾼 사용자는 실제 선택 드래그가 감지되지 않고 물리 왼쪽 클릭이 드래그로 잡힌다. `GetSystemMetrics(SM_SWAPBUTTON)`으로 가상 키를 바꾼다.
4. **[중간] 폴링 기반 드래그 판정의 미탐** (likely) — `selection.ps1:36-41`. 버튼이 눌린 상태가 두 번 이상 샘플링되고 그 사이 8px를 넘게 움직여야 `$moved`가 켜진다. 350ms보다 짧은 드래그, 더블/트리플 클릭 선택, Shift+방향키 선택, 터치·펜 입력은 미지원 안내를 받지 못한다. 안내 기능이 가장 필요한 크롬 계열처럼 TextPattern은 있으나 선택이 비는 경우도 `$hasPattern`이 true라 보고되지 않는다.
5. **[중간] 선택 읽기가 드래그와 무관** (confirmed, 기존 동작) — `selection.ps1:73-80`. `$dragEnded`는 미지원 보고에만 쓰이고 선택 읽기에는 쓰이지 않는다. Ctrl+A나 키보드 선택도 안정되면 위키백과와 선택한 AI 공급자로 전달된다. 동의 대화상자의 "드래그로 선택한 텍스트만"(`main.js:103`)과 어긋난다. 문구를 고치거나 `$dragEnded` 이후 일정 시간만 읽도록 제한한다. 이번 diff 밖이지만 새 드래그 감지를 이 용도로 쓸 수 있다.
6. **[낮음] `powershell.exe` 이름만으로 실행** (possible) — `selectionWatcher.js:43`, `compat.js:36`. Windows의 Node는 실행 파일을 찾을 때 현재 작업 디렉터리를 먼저 볼 수 있다. 작업 디렉터리에 `powershell.exe`가 있으면 그것이 실행된다. `%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe` 절대 경로를 쓴다. 확인하려면 임시 폴더에 더미 `powershell.exe`를 두고 그 폴더를 cwd로 실행해 본다.
7. **[낮음] 프로세스 이름 정규식이 ASCII만 허용** (confirmed) — `selectionWatcher.js:6`. JS의 `\w`는 한글을 포함하지 않아 한글 실행 파일 이름은 `proc`이 빈 문자열이 되고, `main.js:147`이 PID를 키로 쓴다. 그 앱을 다시 실행할 때마다 안내가 반복된다. `\p{L}\p{N}`과 `u` 플래그로 허용한다.
8. **[낮음] "프로세스당 1회"의 키가 계층마다 다름** (confirmed) — 헬퍼는 PID 기준(`selection.ps1:68-69`), 메인은 프로세스 이름 기준(`main.js:147-149`)이며 메인 쪽은 앱 종료까지 초기화되지 않는다. `ApplicationFrameHost`, `explorer`, `msedgewebview2`처럼 여러 앱을 호스트하는 프로세스는 첫 한 번만 안내된다. 헬퍼 쪽 PID 재사용도 안내를 막을 수 있다. 사용자가 창을 숨긴 상태에서 안내가 소모되면 다시 볼 수 없다.
9. **[낮음] 헬퍼 비정상 종료가 조용함** (likely) — `selectionWatcher.js:62`, `:46`. 종료 이벤트는 `child = null`만 하고 상태를 푸시하지 않아 설정은 자동 분석 켜짐, 실제는 감지 중지가 된다. stderr 파이프는 읽지 않아 오류 원인도 남지 않는다. 신규 `Add-Type -MemberDefinition`(`selection.ps1:18`)은 제한된 언어 모드에서 막힐 수 있고, 이때 `$ErrorActionPreference='SilentlyContinue'` 때문에 드래그 감지만 조용히 꺼진다(possible, 해당 환경에서 확인 필요). 종료 코드와 길이만 담은 진단 이벤트를 보낸다.
10. **[낮음] 창 크기 축소가 영구 적용** (confirmed) — `main.js:76-80`. `min(w, area)`로 줄인 크기를 `setBounds`로 적용하며 되돌리지 않는다. 작은 모니터를 거치면 큰 모니터에서도 작은 창이 된다. `main.js`와 `windowPlacement.js:5-6`에서 같은 보정이 중복된다. 작업 영역이 `minHeight`(480)보다 작은 배율에서는 최소 크기가 보정을 이겨 창이 영역을 벗어날 수 있다(possible). 배율이 다른 모니터 사이의 `setBounds` 크기 변동과, 최소화 상태에서의 `showInactive` 복원 여부도 실기기 확인이 필요하다(possible).
11. **[낮음] 비밀번호 제외의 한계** (possible) — `selection.ps1:53`. 판정은 포커스된 요소의 `IsPassword`뿐이다. 비밀번호 표시 토글로 평문이 된 입력란이나 `IsPassword`를 노출하지 않는 커스텀 컨트롤은 읽힌다. 클립보드 경로(`main.js:157`)는 출처를 알 수 없어 제외할 방법이 없다. 미지원 안내(이슈 2)가 이 경로를 권장하므로 사용자 안내에 한계를 적는다.
12. **[낮음] IPC 입력 검증 누락 한 곳** (confirmed) — `main.js:204`. `regenerate`의 `kind`, `index`가 메인에서 검증되지 않고 서비스로 넘어간다. `kind: 'constructor'`는 `service.js:106`의 `list.length`에서 TypeError가 나 거부된 프로미스로 돌아온다. 영향은 작지만 `kind`는 허용 목록으로, `index`는 정수로 메인에서 걸러 낸다. 새 채널은 없고, `guard`(`main.js:186`)는 발신 `webContents`만 확인한다. 이번 diff 밖: `set-provider`(`main.js:207`)는 동의 이후 외부 공급자로 바꿔도 재동의를 받지 않는다.
13. **[낮음] 테스트 공백** (confirmed) — 드래그 판정, 비밀번호 제외, PID별 1회 보고가 있는 `selection.ps1`에는 테스트가 없다. `onUnsupported`(`main.js:144-155`)의 자동 분석 꺼짐, 자체 PID, 중복 억제 분기도 검증되지 않는다. 헬퍼 테스트는 비Windows에서 조용히 `return`해 통과로 집계된다(`watcher.test.js`). `ownPids`와 `onUnsupported`를 `src/core`로 분리하거나 주입 가능하게 하면 테스트할 수 있다.

</details>

<details>
<summary>Details</summary>

### 미지원 안내의 발동 조건

`selection.ps1:36-41`은 폴링마다 왼쪽 버튼 상태와 커서 위치를 읽는다. 누른 순간의 위치를 기억하고, 누른 채 맨해튼 거리 8px를 넘으면 `$moved`를 켜며, 뗀 순간 한 번 `$dragEnded`가 참이 된다. 이후 `selection.ps1:68`은 비밀번호가 아니고 TextPattern이 없고 PID가 처음이면 `unsupported`를 내보낸다.

이 판정에는 "텍스트를 선택하려 했다"는 정보가 전혀 없다. 포커스된 요소는 마우스 아래 요소와 다를 수 있고, TextPattern이 없는 요소는 버튼, 목록, 제목 줄을 포함한다. 그래서 어느 앱에서든 창을 한 번 끌면 그 프로세스의 첫 안내가 소모되고 결과 창이 `showInactive`로 커서 옆에 뜬다(`main.js:151`). 이후 같은 앱에서 진짜 텍스트 선택이 실패해도 안내는 다시 나오지 않는다.

반대 방향의 미탐은 샘플링 주기에서 온다. 기본 350ms 간격에서 누름과 뗌이 서로 다른 샘플이어야 하고, 누름이 두 번 이상 샘플되어야 이동 거리가 쌓인다. 텍스트 드래그는 대개 300ms 안팎이라 상당수가 빠진다. 기본 간격을 줄이거나 `GetAsyncKeyState`의 하위 비트(마지막 호출 이후 눌림 여부)를 함께 쓰면 줄일 수 있다.

### 안내 문구와 실제 경로

```
드래그 끝 ─▶ unsupported ─▶ main.js:153 "선택한 뒤 Ctrl+Alt+Space"
                                         │
                       단축키 ─▶ analyzeClipboard ─▶ clipboard.readText()
```

단축키는 선택 영역이 아니라 클립보드를 읽는다(`main.js:157-158`). 사용자가 안내대로 선택만 하고 단축키를 누르면 이전에 복사한 내용이 분석되고, 그것이 비밀번호 관리자에서 복사한 값일 수도 있다. 문구를 "복사한 뒤"로 바꾸면 동작과 일치한다.

### 텍스트 비노출 경로 점검

점검한 경로는 헬퍼 출력(`selection.ps1:70`)과 `parseLine` 화이트리스트(`selectionWatcher.js:21-27`), `onError` 메시지(`main.js:268`), 스모크 로그(`main.js:226`, 스모크 모드 전용), `compat-probe.ps1` 출력이다. 어느 곳에도 선택 텍스트나 창 제목이 실리지 않는다. compat 출력에는 프로세스 이름과 버전이 남으며, 호환성 표에 붙여 넣으면 사용자가 쓰는 앱 목록이 문서에 기록된다.

### 창 배치

`windowPlacement.js`는 창 크기를 작업 영역으로 제한한 값으로 위치를 계산해 영역 안에 넣는다. 속성 테스트(`watcher.test.js`, Property 1)가 이를 검증한다. 문제는 호출 쪽이다. `showNearCursor`가 먼저 크기를 줄이고(`main.js:77-79`) `setBounds`로 적용하므로, 일시적으로 필요한 보정이 창의 영구 크기가 된다. 작업 영역이 `minWidth`/`minHeight`보다 작은 경우의 기대 동작은 정해져 있지 않다.

</details>

<details>
<summary>File map</summary>

- `src/native/selection.ps1`: 드래그 감지, 미지원 보고, 폴링 인자 추가
- `src/main/selectionWatcher.js`: 메시지 종류별 파싱, 인자 전달과 보정, 프로세스 이름 검증
- `src/main/main.js`: `onUnsupported`와 1회 안내, 스모크 이벤트 시그니처 수정
- `src/main/windowPlacement.js`: 작업 영역보다 큰 창 처리
- `scripts/compat.js`, `scripts/compat-probe.ps1`: 호환성 측정(내용 비수집)
- `test/desktop/main.test.js`, `test/desktop/watcher.test.js`: 파싱, 배치, 측정 출력 테스트
- `package.json`: `compat` 스크립트

전체 diff: `git diff -- src test package.json` (추적되지 않은 `scripts/compat*`, `test/desktop/watcher.test.js`는 신규 파일)

</details>
