'use strict';
// Stop / PostTaskExec Hook: 전체 단위 테스트와 보안 정적 점검을 실행한다.
// 스모크 테스트(Electron, 네트워크)는 느려서 넣지 않는다. 합치기 전에 사람이 node scripts/smoke.js로 확인한다.
const { readStdin, runNodeTests, runCheck } = require('./lib');

const event = readStdin();
const label = event.hook_event_name || 'verify';
const tests = runNodeTests(['test/**/*.test.js']);
const check = runCheck();
const summary = `[verify:${label}] 테스트 ${tests.pass}/${tests.tests} 통과, 보안 점검 ${check.ok ? '통과' : '실패'}`;
if (tests.ok && check.ok) {
  process.stdout.write(`${summary}\n`);
  process.exit(0);
}
const detail = [summary, ...tests.failures, check.ok ? '' : check.output].filter(Boolean).join('\n');
process.stderr.write(`${detail}\n작업을 끝내기 전에 실패를 고치세요.\n`);
process.exit(1);
