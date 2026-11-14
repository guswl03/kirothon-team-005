'use strict';
// PostFileSave Hook: 저장된 파일의 영역에 맞는 테스트만 실행한다.
// 성공하면 요약을 에이전트 컨텍스트에 남기고(exit 0), 실패하면 실패 목록을 stderr로 알린다(exit 1).
const { readStdin, toRepoPath, extractPaths, testTargets, runNodeTests } = require('./lib');

const event = readStdin();
const cwd = event.cwd || process.cwd();
const files = extractPaths(event).map((p) => toRepoPath(p, cwd)).filter(Boolean);
const globs = [...new Set(files.flatMap(testTargets))];
if (!globs.length) process.exit(0);

const r = runNodeTests(globs);
if (r.ok) {
  process.stdout.write(`[test-on-save] ${globs.join(', ')}: ${r.pass}/${r.tests} 통과\n`);
  process.exit(0);
}
process.stderr.write(`[test-on-save] ${globs.join(', ')}: ${r.fail}개 실패\n${r.failures.join('\n')}\n실패한 테스트를 고친 뒤 계속하세요.\n`);
process.exit(1);
