'use strict';
// PostFileSave(src/**) Hook: scripts/check.js 보안 정적 점검을 실행한다.
const { runCheck } = require('./lib');

const r = runCheck();
if (r.ok) {
  process.stdout.write('[security-check] 보안 정적 점검 통과\n');
  process.exit(0);
}
process.stderr.write(`[security-check] 보안 정적 점검 실패\n${r.output}\n규칙: innerHTML, eval, shell:true, exec, console.log, 하드코딩 비밀값 금지.\n`);
process.exit(1);
