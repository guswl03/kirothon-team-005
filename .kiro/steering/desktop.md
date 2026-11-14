---
inclusion: fileMatch
fileMatchPattern: "src/{main,native}/**"
---
# 데스크톱 통합(A 담당) 지침

- 선택 텍스트는 로그, 파일, 콘솔, 오류 메시지에 남기지 않는다. 진단 출력에는 길이와 컨트롤 종류만 쓴다.
- 비밀번호 입력란(`IsPassword`)은 항상 건너뛴다.
- 외부 프로세스는 `shell: false`와 인자 배열로 실행한다.
- 결과 창은 포커스를 가져가지 않고 표시한다(`showInactive`). 사용자가 직접 연 경우만 포커스를 준다.
- 창 위치는 항상 커서가 있는 모니터의 작업 영역 안으로 보정한다.
- IPC 채널을 추가하면 `main.js`와 `preload.js`, `renderer.js`가 함께 바뀐다. 렌더러는 C 담당이므로 같은 PR로 묶는다.
- 수정 범위는 `src/main/`, `src/native/`, `test/desktop/`이다. 그 밖은 담당자와 먼저 합의한다.
- 변경 후 `npm test`, `npm run check`, `npm run smoke`를 실행한다.