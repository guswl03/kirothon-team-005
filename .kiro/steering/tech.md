---
inclusion: always
---
# 기술 스택과 명령

## 스택
- 런타임: Electron 45 (Windows 우선), Node 내장 모듈만 사용. 런타임 npm 의존성은 없다(devDependencies: electron, electron-builder).
- 모듈: CommonJS(`'use strict'`, `require`). TypeScript, 번들러, 린터는 쓰지 않는다.
- 테스트: `node:test` + `node:assert/strict`. 외부 테스트 프레임워크를 추가하지 않는다.
- 네이티브: `src/native/selection.ps1` (Windows UI Automation, PowerShell).

## 명령
| 목적 | 명령 | 비고 |
|---|---|---|
| 단위 테스트 | `node --test "test/**/*.test.js"` | `npm test`와 같다. 디렉터리 인자(`test/ai/`)는 동작하지 않으니 glob을 쓴다. |
| 보안 정적 점검 | `node scripts/check.js` | `npm run check` |
| 종단 스모크 | `node scripts/smoke.js` | Electron 실행, 위키백과 네트워크 필요 |
| Kiro 실측 | `node scripts/measure-kiro.js [--runs N] [--no-search]` | kiro-cli 로그인 또는 KIRO_API_KEY 필요 |
| 실행 | `npm.cmd start` | 개발 서버처럼 오래 실행되므로 에이전트가 직접 실행하지 않는다 |

- PowerShell 실행 정책 때문에 `npm`(npm.ps1)이 막힐 수 있다. `npm.cmd` 또는 `node`를 직접 호출한다.
- 출력이 깨지는 터미널에서는 `cmd /c "... > %TEMP%\out.txt 2>&1"`로 파일에 받아서 읽는다.

## 코딩 규칙
- 외부 프로세스는 `spawn(cmd, [args], { shell: false })`만 쓴다. `exec`, `shell: true`는 금지(`scripts/check.js`가 검사).
- 비동기 작업은 `AbortSignal`을 받아 취소를 전파한다. 취소는 `AbortError`로 조용히 끝낸다.
- 외부 입력(선택 텍스트, 모델 응답, 검색 결과)은 신뢰하지 않는다. 길이를 자르고 타입을 확인한다.
- 비밀값은 환경 변수로만 읽는다. 코드, 테스트, 문서에 실제 키를 쓰지 않는다.
