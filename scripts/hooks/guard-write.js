'use strict';
// PreToolUse(write) Hook
// 1) 비밀값(API 키, 개인 키)이나 .env 파일 쓰기는 차단한다(exit 2).
// 2) 공유 영역이나 다른 역할 소유 파일이면 사용자 확인을 요청한다(permissionDecision: ask).
const { readStdin, toRepoPath, extractPaths, findSecrets, writtenText, currentBranch, ownershipDecision } = require('./lib');

const event = readStdin();
const input = event.tool_input || {};
const cwd = event.cwd || process.cwd();
const raw = extractPaths(input);
const repoPaths = raw.map((p) => toRepoPath(p, cwd)).filter(Boolean);

const envFile = raw.find((p) => /(^|[\\/])\.env(\.[^\\/]*)?$/.test(p) && !/\.env\.example$/.test(p));
if (envFile) {
  process.stderr.write('[guard-write] 차단: .env 파일은 에이전트가 쓰지 않아요. 키는 사용자가 터미널 환경 변수로 설정합니다.\n');
  process.exit(2);
}

const secrets = findSecrets(writtenText(input));
if (secrets.length) {
  process.stderr.write(`[guard-write] 차단: 쓰려는 내용에 ${secrets.join(', ')}로 보이는 값이 있어요. 키는 환경 변수로만 읽습니다.\n`);
  process.exit(2);
}

const decision = ownershipDecision(repoPaths, currentBranch());
if (decision) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: { permissionDecision: 'ask', permissionDecisionReason: `[팀 규칙] ${decision.reason}` },
  }));
}
process.exit(0);
