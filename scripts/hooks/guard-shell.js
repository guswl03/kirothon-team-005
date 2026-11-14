'use strict';
// PreToolUse(shell) Hook: 되돌리기 어려운 명령을 막는다. exit 2 = 차단, stderr가 에이전트에게 전달된다.
const { readStdin, classifyShell } = require('./lib');

const event = readStdin();
const input = event.tool_input || {};
const command = input.command || input.cmd || input.script || '';
const verdict = classifyShell(command);
if (verdict.block) {
  process.stderr.write(`[guard-shell] 차단: ${verdict.reason} 꼭 필요하면 사용자에게 직접 실행을 요청하세요.\n`);
  process.exit(2);
}
process.exit(0);
