'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const lib = require('../../scripts/hooks/lib');

const HOOKS = path.join(__dirname, '..', '..', 'scripts', 'hooks');
const run = (script, event) => spawnSync(process.execPath, [path.join(HOOKS, script)], { input: JSON.stringify(event), encoding: 'utf8', windowsHide: true });
// 비밀값 패턴이 저장소에 그대로 남지 않도록 조합해서 만든다.
const fakeOpenAiKey = ['sk', 'proj', 'A'.repeat(24)].join('-');
const fakeKiroKey = ['ksk', 'B'.repeat(20)].join('_');

test('classifyShell: 되돌리기 어려운 git 명령을 막는다', () => {
  for (const cmd of [
    'git push --force origin main', 'git push -f', 'git reset --hard HEAD~1', 'git clean -fd',
    'git branch -D feat/ui', 'git commit -m x --no-verify', 'git config user.name x', 'git checkout -- .', 'npm publish',
  ]) assert.equal(lib.classifyShell(cmd).block, true, cmd);
});

test('classifyShell: 일반 명령과 읽기 전용 git config는 허용한다', () => {
  for (const cmd of ['git status', 'git push -u origin feat/ai', 'git config --get user.name', 'node --test "test/**/*.test.js"', 'git log --oneline -5'])
    assert.equal(lib.classifyShell(cmd).block, false, cmd);
});

test('classifyShell: 재귀 강제 삭제는 빌드 산출물·임시 폴더만 허용한다', () => {
  assert.equal(lib.classifyShell('rm -rf src').block, true);
  assert.equal(lib.classifyShell('Remove-Item -Recurse -Force .git').block, true);
  assert.equal(lib.classifyShell('Remove-Item -Recurse -Force node_modules').block, false);
  assert.equal(lib.classifyShell('rm -rf dist').block, false);
});

test('findSecrets: 키 종류만 알려 주고 일반 문장은 통과시킨다', () => {
  assert.deepEqual(lib.findSecrets(`const k = "${fakeOpenAiKey}"`), ['OpenAI API 키']);
  assert.deepEqual(lib.findSecrets(`KIRO_API_KEY=${fakeKiroKey}`), ['Kiro API 키']);
  assert.deepEqual(lib.findSecrets('$env:CHEAT_LLM_API_KEY = "sk-..."'), []);
});

test('ownershipDecision: 공유 영역과 다른 역할 파일이면 확인을 요청한다', () => {
  assert.match(lib.ownershipDecision(['src/core/service.js'], 'feat/ai').reason, /B와 C의 계약/);
  assert.match(lib.ownershipDecision(['src/renderer/renderer.js'], 'feat/ai').reason, /C\. UI/);
  assert.equal(lib.ownershipDecision(['src/ai/search.js', 'test/ai/search.test.js'], 'feat/ai'), null);
  assert.equal(lib.ownershipDecision(['src/renderer/renderer.js'], 'main'), null);
  assert.match(lib.ownershipDecision(['PRD.md'], 'main').reason, /PRD/);
});

test('extractPaths / toRepoPath: 여러 도구 입력 형식에서 경로를 찾는다', () => {
  const paths = lib.extractPaths({ path: 'src/ai/a.js', targetFile: 'b.js', nested: { file_path: 'c.js' }, text: 'not a path' });
  assert.deepEqual(paths.sort(), ['b.js', 'c.js', 'src/ai/a.js']);
  assert.equal(lib.toRepoPath(path.join(lib.ROOT, 'src', 'ai', 'x.js')), 'src/ai/x.js');
  assert.equal(lib.toRepoPath(path.join(lib.ROOT, '..', 'outside.js')), null);
});

test('testTargets: 저장한 파일 영역의 테스트만 고른다', () => {
  assert.deepEqual(lib.testTargets('src/ai/search.js'), ['test/ai/*.test.js', 'test/core/*.test.js']);
  assert.deepEqual(lib.testTargets('src/main/main.js'), ['test/desktop/*.test.js']);
  assert.deepEqual(lib.testTargets('README.md'), []);
});

test('guard-shell.js: 차단하면 exit 2와 사유, 허용하면 exit 0', () => {
  const blocked = run('guard-shell.js', { hook_event_name: 'PreToolUse', tool_name: 'execute_pwsh', tool_input: { command: 'git reset --hard' } });
  assert.equal(blocked.status, 2);
  assert.match(blocked.stderr, /reset --hard/);
  assert.equal(run('guard-shell.js', { tool_input: { command: 'git status' } }).status, 0);
  assert.equal(run('guard-shell.js', {}).status, 0);
});

test('guard-write.js: 비밀값과 .env는 차단, 공유 영역은 ask', () => {
  const secret = run('guard-write.js', { tool_name: 'fs_write', tool_input: { path: 'src/ai/x.js', text: `const k = "${fakeOpenAiKey}";` } });
  assert.equal(secret.status, 2);
  assert.ok(!secret.stderr.includes(fakeOpenAiKey), '키 값 자체는 출력하지 않는다');
  assert.equal(run('guard-write.js', { tool_input: { path: '.env', text: 'A=1' } }).status, 2);
  const shared = run('guard-write.js', { tool_input: { path: 'src/core/service.js', newStr: 'x' } });
  assert.equal(shared.status, 0);
  assert.equal(JSON.parse(shared.stdout).hookSpecificOutput.permissionDecision, 'ask');
});

test('context.js: 브랜치와 검증 명령을 3,000자 이내로 출력한다', () => {
  const r = run('context.js', { hook_event_name: 'SessionStart' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\[project-context\]/);
  assert.match(r.stdout, /scripts\/check\.js/);
  assert.ok(r.stdout.length < 3000);
});
