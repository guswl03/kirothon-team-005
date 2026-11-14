'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createKiroProvider } = require('../../src/ai/providers/kiro');
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

test('OpenAI 호환: 미설정이면 거부, http(원격)는 거부', async () => {
  await assert.rejects(createOpenAiProvider({ baseUrl: '', apiKey: '', model: '' }).generate({ prompt: 'a' }), /설정이 필요/);
  await assert.rejects(createOpenAiProvider({ baseUrl: 'http://evil.example.com', apiKey: 'k', model: 'm' }).generate({ prompt: 'a' }), /https/);
});

test('OpenAI 호환: 정상 응답 파싱', async () => {
  const fetchImpl = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"a":1}' } }] }) });
  const p = createOpenAiProvider({ baseUrl: 'https://api.example.com/v1/', apiKey: 'k', model: 'm', fetchImpl });
  assert.equal(await p.generate({ prompt: 'a' }), '{"a":1}');
});