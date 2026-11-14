'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createKiroProvider, checkKiro, resolveKiroCommand } = require('../../src/ai/providers/kiro');
const { createOpenAiProvider } = require('../../src/ai/providers/openai');

function fakeSpawn({ stdout = '', stderr = '', code = 0, error }) {
  const calls = [];
  const fn = (cmd, args, opts) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    let written = '';
    child.stdin = Object.assign(new EventEmitter(), { end: (d) => { written = d; calls.push({ cmd, args, opts, written }); setImmediate(() => {
      if (error) return child.emit('error', error);
      if (stdout) child.stdout.emit('data', stdout);
      if (stderr) child.stderr.emit('data', stderr);
      child.emit('close', code);
    }); } });
    child.kill = () => {};
    return child;
  };
  fn.calls = calls;
  return fn;
}

test('Kiro: 프롬프트는 stdin으로 전달되고 셸을 쓰지 않으며 도구 신뢰 옵션이 없다', async () => {
  const spawnImpl = fakeSpawn({ stdout: '\u001b[32m{"ok":true}\u001b[0m\n' });
  const p = createKiroProvider({ spawnImpl, command: 'kiro-cli' });
  const out = await p.generate({ prompt: '"; rm -rf / #' });
  assert.equal(out, '{"ok":true}');
  const c = spawnImpl.calls[0];
  assert.equal(c.opts.shell, false);
  assert.deepEqual(c.args, ['chat', '--v3', '--no-interactive']);
  assert.ok(!c.args.some((a) => /trust/.test(a)));
  assert.equal(c.written, '"; rm -rf / #');
});

test('Kiro: 저장소가 아닌 앱 전용 임시 폴더에서 실행한다', async () => {
  const path = require('node:path');
  const os = require('node:os');
  const spawnImpl = fakeSpawn({ stdout: '{}' });
  await createKiroProvider({ spawnImpl }).generate({ prompt: 'a' });
  const cwd = spawnImpl.calls[0].opts.cwd;
  assert.ok(cwd.startsWith(os.tmpdir()));
  assert.notEqual(path.resolve(cwd), path.resolve(__dirname, '..', '..'));
});

test('Kiro: JSON 앞뒤에 안내 문구가 섞여도 extractJson으로 읽을 수 있다', async () => {
  const { extractJson } = require('../../src/ai/schema');
  const spawnImpl = fakeSpawn({ stdout: '\u001b[1m> \u001b[0m좋아요, 결과입니다.\n{"topic":"t"}\n\u001b[2m▸ Credits: 0.1\u001b[0m\n' });
  const out = await createKiroProvider({ spawnImpl, getCwd: () => '.' }).generate({ prompt: 'a' });
  assert.deepEqual(extractJson(out), { topic: 't' });
});

test('Kiro: 타임아웃은 옵션 > KIRO_TIMEOUT_MS > 기본값 순서, 잘못된 값은 무시', () => {
  const prev = process.env.KIRO_TIMEOUT_MS;
  try {
    process.env.KIRO_TIMEOUT_MS = '45000';
    assert.equal(createKiroProvider({ timeoutMs: 5000 }).timeoutMs, 5000);
    assert.equal(createKiroProvider().timeoutMs, 45000);
    process.env.KIRO_TIMEOUT_MS = 'abc';
    assert.equal(createKiroProvider().timeoutMs, 120000);
  } finally {
    if (prev === undefined) delete process.env.KIRO_TIMEOUT_MS; else process.env.KIRO_TIMEOUT_MS = prev;
  }
});

test('Kiro: 시간 초과면 프로세스를 종료하고 오류', async () => {
  let killed = false;
  const spawnImpl = () => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.stdin = Object.assign(new EventEmitter(), { end: () => {} });
    child.kill = () => { killed = true; };
    return child;
  };
  await assert.rejects(createKiroProvider({ spawnImpl, timeoutMs: 1000, getCwd: () => '.' }).generate({ prompt: 'a' }), /시간이 초과/);
  assert.ok(killed);
});

test('Kiro: 설치되지 않은 경우 이해하기 쉬운 오류', async () => {
  const p = createKiroProvider({ spawnImpl: fakeSpawn({ error: Object.assign(new Error('x'), { code: 'ENOENT' }) }) });
  await assert.rejects(p.generate({ prompt: 'a' }), /kiro-cli를 찾을 수 없어요/);
});

test('Kiro: 비정상 종료 코드는 오류', async () => {
  const p = createKiroProvider({ spawnImpl: fakeSpawn({ code: 1, stderr: 'auth' }) });
  await assert.rejects(p.generate({ prompt: 'a' }), /종료 코드 1/);
});

function fakeWhoami({ code = 0, error } = {}) {
  const calls = [];
  const fn = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    const child = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.kill = () => {};
    setImmediate(() => { if (error) child.emit('error', error); else { child.stdout.emit('data', 'Email: someone@example.com'); child.emit('close', code); } });
    return child;
  };
  fn.calls = calls;
  return fn;
}

test('checkKiro: whoami 성공이면 connected(로그인 세션), 셸 없이 whoami만 실행', async () => {
  const spawnImpl = fakeWhoami({ code: 0 });
  const r = await checkKiro({ spawnImpl, command: 'kiro-cli', env: {} });
  assert.equal(r.status, 'connected');
  assert.equal(r.auth, 'login');
  assert.deepEqual(spawnImpl.calls[0].args, ['whoami']);
  assert.equal(spawnImpl.calls[0].opts.shell, false);
  assert.ok(!JSON.stringify(r).includes('someone@example.com'), '계정 정보는 결과에 남기지 않는다');
});

test('checkKiro: 미설치, 로그인 안 됨, API 키만 있음을 구분한다', async () => {
  const enoent = Object.assign(new Error('x'), { code: 'ENOENT' });
  assert.equal((await checkKiro({ spawnImpl: fakeWhoami({ error: enoent }), command: 'k', env: {} })).status, 'not_installed');
  assert.equal((await checkKiro({ spawnImpl: fakeWhoami({ code: 1 }), command: 'k', env: {} })).status, 'not_logged_in');
  const key = await checkKiro({ spawnImpl: fakeWhoami({ code: 1 }), command: 'k', env: { KIRO_API_KEY: 'x' } });
  assert.equal(key.status, 'connected');
  assert.equal(key.auth, 'api_key');
});

test('checkKiro: 응답이 없으면 시간 초과로 error', async () => {
  const spawnImpl = () => { const c = new EventEmitter(); c.kill = () => {}; return c; };
  assert.equal((await checkKiro({ spawnImpl, command: 'k', env: {}, timeoutMs: 50 })).status, 'error');
});

test('resolveKiroCommand: KIRO_CLI_PATH > PATH > Windows 기본 설치 위치', () => {
  const path = require('node:path');
  const local = path.join('C:\\Users\\u\\AppData\\Local', 'Kiro-Cli', 'kiro-cli.exe');
  const has = (set) => (p) => set.includes(p);
  assert.equal(resolveKiroCommand({ env: { KIRO_CLI_PATH: 'X:\\k.exe' }, exists: has([]), platform: 'win32' }), 'X:\\k.exe');
  assert.equal(resolveKiroCommand({ env: { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local', PATH: '' }, exists: has([local]), platform: 'win32' }), local);
  if (process.platform === 'win32') {   // PATH 구분자가 ';'인 환경에서만 의미 있는 경우
    const onPath = path.join('D:\\bin', 'kiro-cli.exe');
    assert.equal(resolveKiroCommand({ env: { LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local', PATH: 'D:\\bin' }, exists: has([local, onPath]), platform: 'win32' }), 'kiro-cli');
  }
  assert.equal(resolveKiroCommand({ env: {}, exists: has([]), platform: 'linux' }), 'kiro-cli');
});

test('OpenAI 호환: 미설정이면 거부, http(원격)는 거부', async () => {
  await assert.rejects(createOpenAiProvider({ baseUrl: '', apiKey: '', model: '' }).generate({ prompt: 'a' }), /설정이 필요/);
  await assert.rejects(createOpenAiProvider({ baseUrl: 'http://evil.example.com', apiKey: 'k', model: 'm' }).generate({ prompt: 'a' }), /https/);
});

test('OpenAI 호환: 정상 응답 파싱', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"a":1}' } }] }) });
  const p = createOpenAiProvider({ baseUrl: 'https://api.example.com/v1/', apiKey: 'k', model: 'm', fetchImpl });
  assert.equal(await p.generate({ prompt: 'a' }), '{"a":1}');
});