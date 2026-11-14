'use strict';
// SessionStart / PostCompact Hook: 현재 브랜치, 역할, 남은 spec 작업, 검증 명령을 에이전트 컨텍스트에 넣는다.
// 압축(compaction) 뒤에도 팀 규칙과 진행 상황이 사라지지 않게 한다. 출력은 3,000자 이내로 유지한다.
const { readStdin, currentBranch, ROLES, pendingSpecTasks } = require('./lib');

const event = readStdin();
const branch = currentBranch() || '(알 수 없음)';
const role = ROLES[branch];
const pending = pendingSpecTasks();
const lines = [
  `[project-context] ${event.hook_event_name === 'PostCompact' ? '압축 후 복원' : '세션 시작'}`,
  `- 브랜치: ${branch}${role ? ` (${role.name}, 소유: ${role.owns.join(', ')})` : ' (역할 브랜치 아님: feat/desktop, feat/ai, feat/ui 중 하나에서 작업)'}`,
  '- 공유 영역(src/core/service.js 이벤트 형식, package.json, .kiro/)은 바꾸기 전에 팀에 알린다.',
  '- 검증: node --test "test/**/*.test.js" / node scripts/check.js / node scripts/smoke.js (PowerShell에서는 npm 대신 npm.cmd)',
  '- 선택 텍스트와 생성 결과는 저장·로그 금지. 사실은 검색 출처 ID에 연결된 것만 표시.',
];
if (pending.length) {
  lines.push(`- 남은 spec 작업 ${pending.length}개:`);
  pending.slice(0, 12).forEach((t) => lines.push(`  - ${t}`));
}
process.stdout.write(lines.join('\n').slice(0, 2900) + '\n');
process.exit(0);
