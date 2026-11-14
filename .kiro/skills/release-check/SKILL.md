---
name: release-check
description: 브랜치를 main에 합치거나 해커톤에 제출하기 전에 테스트, 보안 점검, 스모크, spec 진행 상황, 공유 영역 변경을 한 번에 확인한다. "합쳐도 돼?", "제출 전 확인", "릴리스 체크" 요청에 사용한다.
---

# 합치기·제출 전 확인

## 1. 자동 확인
```powershell
git status --short
git branch --show-current
node --test "test/**/*.test.js"
node scripts/check.js
node scripts/smoke.js
```
- 터미널 출력이 깨지면 `cmd /c "node scripts/smoke.js > %TEMP%\smoke.txt 2>&1"`로 받아서 읽는다.
- smoke 결과는 `"ok": true`, `resultsVisible: true`, 이벤트 순서 `start, stage:searching, sources, stage:generating, result, stage:done`이어야 한다.
- MCP `cheatsheet-dev`의 `project_status`를 `runChecks: true`로 호출해도 1~4번을 한 번에 볼 수 있다.

## 2. 변경 범위 확인
- `git diff --stat main...HEAD`로 바뀐 파일을 보고, 현재 역할의 소유 디렉터리 밖 파일이 있는지 확인한다(`docs/TEAM_WORKFLOW.md`).
- 공유 영역(`src/core/service.js`, `package.json`, `docs/SECURITY_REVIEW.md`, `.kiro/`)이 바뀌었으면 팀에 알렸는지 사용자에게 묻는다.

## 3. 문서 확인
- `.kiro/specs/*/tasks.md`에서 남은 `[ ]` 항목을 나열한다.
- 새 외부 전송이 생겼으면 동의 창 문구와 `docs/SECURITY_REVIEW.md`가 갱신됐는지 확인한다.

## 4. 보고
각 항목을 통과/실패/확인 못 함으로 표시한다. 실패가 하나라도 있으면 "합치지 말 것"으로 결론 내고 고칠 순서를 제안한다. push와 PR 생성은 사용자가 요청할 때만 한다.
