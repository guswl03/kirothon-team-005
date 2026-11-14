'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createKiroLogin, extractLogin, isAllowedLoginUrl, METHODS } = require('../../src/main/kiroLogin');

// 수동 타이머: tick()으로 반복 타이머를, fire()로 제한 시간을 직접 실행한다.
function fakeTimers() {
  const repeats = new Map(); const timers = new Map(); let id = 0;
  return {
    setRepeat: (fn) => { id += 1; repeats.set(id, fn); return id; },
    clearRepeat: (i) => repeats.delete(i),
    setTimer: (fn) => { id += 1; timers.set(id, fn); return id; },
    clearTimer: (i) => timers.delete(i),
    tick: () => [...repeats.values()].forEach((f) => f()),
    fire: () => [...timers.values()].forEach((f) => f()),
    get active() { return repeats.size + timers.size; },
  };
}
function fakeSpawn() {
  const calls = [];
  const fn = (cmd, args, opts) => {
    const c = new EventEmitter();
    c.stdout = new EventEmitter(); c.stderr = new EventEmitter();
    c.kill = () => { c.killed = true; };
    c.unref = () => { c.unrefed = true; };
    calls.push({ cmd, args, opts, child: c });
    return c;
  };
  fn.calls = calls;
  return fn;
}
const flush = () => new Promise((r) => setImmediate(r));

function setup({ status = 'not_logged_in' } = {}) {
  const t = fakeTimers();
  const sp = fakeSpawn();
  const states = [];
  const ctl = { status, checks: 0 };
  const login = createKiroLogin({
    getCommand: () => 'C:\\kiro-cli.exe', spawnImpl: sp, onChange: (s) => states.push(s),
    check: async () => { ctl.checks += 1; return { status: ctl.status }; }, ...t,
  });
  return { login, t, sp, states, ctl };
}

test('로그인 방법별 인자: 셸 없이, 창 없이 실행하고 로그인 방법을 인자로 정한다', () => {
  for (const [method, args] of Object.entries({ github: ['login', '--social', 'github'], google: ['login', '--social', 'google'], builder: ['login', '--license', 'free'] })) {
    const { login, sp } = setup();
    assert.equal(login.start(method).ok, true);
    const c = sp.calls[0];
    assert.equal(c.cmd, 'C:\\kiro-cli.exe');
    assert.deepEqual(c.args, args);
    assert.equal(c.opts.shell, false);
    assert.equal(c.opts.windowsHide, true);
    assert.equal(login.state.phase, 'waiting');
  }
  assert.deepEqual(METHODS.terminal, ['login']);
});

test('알 수 없는 방법은 실행하지 않고, 진행 중 중복 시작도 거부한다', () => {
  const { login, sp } = setup();
  assert.equal(login.start('evil; rm').ok, false);
  assert.equal(login.start('__proto__').ok, false);
  assert.equal(sp.calls.length, 0);
  login.start('github');
  assert.equal(login.start('google').ok, false);
  assert.equal(sp.calls.length, 1);
});

test('연결 확인이 성공하면 connected로 끝내고 프로세스와 타이머를 정리한다', async () => {
  const { login, t, sp, ctl } = setup();
  login.start('github');
  t.tick(); await flush();
  assert.equal(login.state.phase, 'waiting');
  ctl.status = 'connected';
  t.tick(); await flush();
  assert.equal(login.state.phase, 'connected');
  assert.equal(sp.calls[0].child.killed, true);
  assert.equal(t.active, 0);
});

test('확인이 진행 중이면 겹쳐서 다시 확인하지 않는다', async () => {
  const t = fakeTimers(); const sp = fakeSpawn();
  let calls = 0; let release;
  const login = createKiroLogin({ getCommand: () => 'k', spawnImpl: sp, check: () => { calls += 1; return new Promise((r) => { release = r; }); }, ...t });
  login.start('google');
  t.tick(); t.tick(); t.tick();
  assert.equal(calls, 1);
  release({ status: 'not_logged_in' }); await flush();
  t.tick();
  assert.equal(calls, 2);
});

test('5분 제한이 지나면 timeout, 취소하면 cancelled로 끝내고 프로세스를 종료한다', () => {
  const a = setup();
  a.login.start('github');
  a.t.fire();
  assert.equal(a.login.state.phase, 'timeout');
  assert.equal(a.sp.calls[0].child.killed, true);
  const b = setup();
  b.login.start('builder');
  assert.equal(b.login.cancel(), true);
  assert.equal(b.login.state.phase, 'cancelled');
  assert.equal(b.sp.calls[0].child.killed, true);
  assert.equal(b.login.cancel(), false);
});

test('취소 뒤 늦게 도착한 확인 결과는 상태를 바꾸지 않는다', async () => {
  const { login, t, ctl } = setup();
  login.start('github');
  ctl.status = 'connected';
  t.tick();               // 확인 시작
  login.cancel();         // 결과 도착 전에 취소
  await flush();
  assert.equal(login.state.phase, 'cancelled');
});

test('실행 실패: 미설치(ENOENT)와 그 밖의 오류, 실패 종료 코드는 원문 없이 짧게 알린다', () => {
  const a = setup();
  a.login.start('github');
  a.sp.calls[0].child.emit('error', Object.assign(new Error('x'), { code: 'ENOENT' }));
  assert.equal(a.login.state.phase, 'failed');
  assert.match(a.login.state.message, /설치되어 있지 않아요/);
  const b = setup();
  b.login.start('github');
  b.sp.calls[0].child.stderr.emit('data', 'secret-account@example.com 오류 상세');
  b.sp.calls[0].child.emit('exit', 1);
  assert.equal(b.login.state.phase, 'failed');
  assert.ok(!JSON.stringify(b.login.state).includes('example.com'));
  const c = createKiroLogin({ getCommand: () => 'k', spawnImpl: () => { throw new Error('boom'); }, check: async () => ({}), ...fakeTimers() });
  assert.equal(c.start('github').ok, false);
  assert.equal(c.state.phase, 'failed');
});

test('이미 로그인된 상태로 종료되면 바로 확인해 connected로 넘어간다', async () => {
  const { login, sp, ctl } = setup();
  login.start('github');
  ctl.status = 'connected';
  sp.calls[0].child.stderr.emit('data', 'error: Already logged in, please logout with kiro-cli logout first');
  sp.calls[0].child.emit('exit', 1);
  await flush();
  assert.equal(login.state.phase, 'connected');
});

test('출력에서 허용된 로그인 주소와 일회용 코드만 상태에 담고, 다른 출력은 담지 않는다', () => {
  const { login, sp } = setup();
  login.start('builder');
  const c = sp.calls[0].child;
  c.stdout.emit('data', '\u001b[1mOpen\u001b[0m https://evil.example.com/x and https://view.awsapps.com/start/#/device?user_code=ABCD-EFGH\n');
  c.stdout.emit('data', 'Code: ABCD-EFGH user someone@example.com\n');
  const s = login.state;
  assert.equal(s.url, 'https://view.awsapps.com/start/#/device?user_code=ABCD-EFGH');
  assert.equal(s.code, 'ABCD-EFGH');
  assert.ok(!JSON.stringify(s).includes('someone@'));
  assert.deepEqual(Object.keys(s).sort(), ['code', 'message', 'method', 'phase', 'url']);
});

test('터미널 방법: 새 콘솔 창으로 띄우고(detached, 출력 미수집) 창이 닫혀도 확인으로 판단한다', async () => {
  const { login, sp, ctl } = setup();
  login.start('terminal');
  const c = sp.calls[0];
  assert.deepEqual(c.args, ['login']);
  assert.equal(c.opts.shell, false);
  assert.equal(c.opts.detached, true);
  assert.equal(c.opts.stdio, 'ignore');
  assert.equal(c.child.unrefed, true);
  ctl.status = 'connected';
  c.child.emit('exit', 0);
  await flush();
  assert.equal(login.state.phase, 'connected');
  assert.notEqual(c.child.killed, true, '사용자가 보는 콘솔 창은 앱이 강제로 닫지 않는다');
});

test('isAllowedLoginUrl / extractLogin', () => {
  for (const ok of ['https://kiro.dev/x', 'https://app.kiro.dev/login', 'https://view.awsapps.com/start', 'https://github.com/login/oauth', 'https://accounts.google.com/o/oauth2', 'https://us-east-1.signin.aws/']) assert.equal(isAllowedLoginUrl(ok), true, ok);
  for (const bad of ['http://kiro.dev/x', 'https://kiro.dev.evil.com/', 'https://evilkiro.dev/', 'https://user:pw@kiro.dev/', 'javascript:alert(1)', 'file:///c:/x', '', null]) assert.equal(isAllowedLoginUrl(bad), false, String(bad));
  assert.deepEqual(extractLogin('nothing here'), { url: '', code: '' });
  assert.deepEqual(extractLogin(null), { url: '', code: '' });
});

test('needsLogin: 미설치·로그인 필요·확인 실패만 막고 연결됨·확인 중은 막지 않는다', () => {
  const { needsLogin } = require('../../src/main/kiroLogin');
  for (const s of ['not_installed', 'not_logged_in', 'error']) assert.equal(needsLogin(s), true, s);
  for (const s of ['connected', 'checking', undefined, '']) assert.equal(needsLogin(s), false, String(s));
});
