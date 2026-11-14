---
inclusion: always
---
# 대화 치트키 제품 지침

- 스택: Electron(Windows 우선), 순수 Node 코어(`src/core`)와 Electron 어댑터(`src/main`)를 분리한다.
- 선택 텍스트와 생성 결과는 저장·로깅하지 않는다. 설정만 저장한다.
- 사실 정보는 검색 결과의 출처 ID에 연결된 것만 사실로 표시한다. 부족하면 지어내지 않고 부족 상태를 알린다.
- 렌더러는 `textContent`만 사용하고 `innerHTML`을 쓰지 않는다.
- 변경 후 `npm test`, `npm run check`, `npm run smoke`를 실행한다.
- 명세는 `.kiro/specs/conversation-cheatsheet/`에 있다.