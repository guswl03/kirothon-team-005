# 팀 작업 분담

디렉터리가 겹치지 않게 나눠서 머지 충돌을 줄입니다. 자동 리뷰 지정은 `.github/CODEOWNERS`를 참고하세요.

| 역할 | 소유 디렉터리 | 하는 일 |
|---|---|---|
| A. 데스크톱 통합 | `src/main/`, `src/native/`, `test/desktop/` | 선택 감지 실측, 창·트레이·단축키, 동의 창, exe 패키징 |
| B. AI·검색 | `src/ai/`, `test/ai/` | Kiro CLI 실제 연동·측정, 프롬프트 튜닝, 검색 보강, 출처 검증 |
| C. UI·문서·발표 | `src/renderer/`, `README.md`, `BUILD_REPORT.md`, `docs/presentation.html`, `PRESENTATION.pdf`, `docs/assets/` | 화면 다듬기, 시연 영상, 발표, 제출 |

## 공유 영역 (바꾸기 전에 말하기)

- `src/core/service.js`: 이벤트 형식(`start`, `sources`, `result`, `error` 등)이 B(생성)와 C(화면)의 계약입니다. B와 C가 먼저 합의하고 바꿉니다.
- `src/core/textGuard.js`, `test/core/`: 위와 같습니다.
- `package.json`, `package-lock.json`, `.gitignore`, `.kiro/`, `docs/SECURITY_REVIEW.md`: 필요한 사람이 작은 커밋으로 바꾸고 바로 알립니다.
- IPC 채널을 추가하면 `src/main/main.js`(A)와 `src/main/preload.js`(A), `src/renderer/renderer.js`(C)가 같이 바뀝니다. A와 C가 한 PR로 묶습니다.

## 진행 방식

1. 역할별 브랜치를 씁니다: `feat/desktop`, `feat/ai`, `feat/ui`.
2. 커밋 전에 `npm test`, `npm run check`를 돌립니다. 합치기 전에는 `npm run smoke`도 돌립니다.
3. `main`에는 작은 단위로 자주 합칩니다. 마감 직전에 몰아서 합치지 않습니다.
4. 마감(18:00) 전 마지막 push는 C가 맡고, 그 전에 모두 합쳐진 상태에서 세 명령을 다시 돌립니다.

## 디렉터리 구조

```text
src/
  main/        A  Electron 메인, 트레이, 설정, 선택 감지 프로세스
  native/      A  UI Automation PowerShell 헬퍼
  ai/          B  prompt, search, schema, providers(kiro, openai)
  core/        공유  service(파이프라인), textGuard
  renderer/    C  결과 창 UI
test/
  desktop/ ai/ core/
```