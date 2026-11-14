'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { parseLine, createSelectionWatcher, clampInt } = require('../../src/main/selectionWatcher');
const { placeWindow } = require('../../src/main/windowPlacement');
const { formatRow, parseProbeOutput } = require('../../scripts/compat');

let seed = 987;
const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const ri = (n) => Math.floor(rnd() * n);

// ---- selectionWatcher ----
test('parseLine: selection / unsupported / 이전 형식', () => {
  assert.deepEqual(parseLine('{"type":"selection","text":"가나","pid":3}'), { type: 'selection', text: '가나', pid: 3, via: 'uia' });
  assert.deepEqual(parseLine('{"text":"가나","pid":3}'), { type: 'selection', text: '가나', pid: 3, via: 'uia' });
  assert.deepEqual(parseLine('{"type":"unsupported","pid":9,"proc":"chrome"}'), { type: 'unsupported', pid: 9, proc: 'chrome' });
});

test('Property 2: unsupported 메시지에는 text 등 알려지지 않은 필드가 실리지 않는다', () => {
  const m = parseLine('{"type":"unsupported","pid":9,"proc":"app","text":"비밀 내용","title":"창 제목"}');
  assert.deepEqual(Object.keys(m).sort(), ['pid', 'proc', 'type']);
  assert.ok(!JSON.stringify(m).includes('비밀'));
  assert.equal(parseLine('{"type":"unsupported","pid":1,"proc":"a;rm -rf"}').proc, '');
});

test('Property 3: 잘못된 줄은 예외 없이 무시된다', () => {
  const junk = ['', ' ', '{', 'null', '[]', '123', '"x"', '{"type":"selection"}', '{"type":"x","text":"a"}', '{"text":5}', '\u0000\u0001'];
  for (let i = 0; i < 300; i++) junk.push(Array.from({ length: ri(30) }, () => String.fromCharCode(32 + ri(95))).join(''));
  for (const j of junk) assert.doesNotThrow(() => parseLine(j));
  assert.equal(parseLine('{"type":"selection"}'), null);
  assert.equal(parseLine('{"type":"x","text":"a"}'), null);
});

function fakeProc() {
  const child = new EventEmitter();
  child.stdout = Object.assign(new EventEmitter(), { setEncoding() {} });
  child.kill = () => { child.killed = true; };
  return child;
}

test('watcher: 줄 단위로 나눠 전달하고 설정값을 인자로 넘기며 shell을 쓰지 않는다', () => {
  if (process.platform !== 'win32') return;
  const child = fakeProc();
  let call;
  const got = []; const uns = [];
  const w = createSelectionWatcher({
    scriptPath: 'x.ps1', intervalMs: 500, stableCount: 3,
    onSelection: (s) => got.push(s), onUnsupported: (u) => uns.push(u),
    spawnImpl: (cmd, args, opts) => { call = { cmd, args, opts }; return child; },
  });
  w.start(); w.start();                       // 두 번 시작해도 한 번만 실행
  assert.equal(call.opts.shell, false);
  assert.deepEqual(call.args.slice(-4), ['-IntervalMs', '500', '-StableCount', '3']);
  child.stdout.emit('data', '{"type":"selection","text":"안');       // 줄이 쪼개져 도착
  child.stdout.emit('data', '녕","pid":4}\n{"type":"unsupported","pid":5,"proc":"p"}\nbad\n');
  assert.deepEqual(got, [{ text: '안녕', pid: 4, via: 'uia' }]);
  assert.deepEqual(uns, [{ pid: 5, proc: 'p' }]);
  w.stop();
  assert.equal(child.killed, true);
  assert.equal(w.running, false);
});

test('watcher: 설정값은 허용 범위로 보정된다', () => {
  assert.equal(clampInt(5, 100, 2000, 350), 100);
  assert.equal(clampInt(99999, 100, 2000, 350), 2000);
  assert.equal(clampInt('abc', 100, 2000, 350), 350);
  assert.equal(clampInt(1.5, 1, 10, 2), 2);
});

// ---- windowPlacement ----
const AREAS = [
  { x: 0, y: 0, width: 1920, height: 1040 },          // 하단 작업 표시줄
  { x: -1920, y: 0, width: 1920, height: 1080 },      // 왼쪽 보조 모니터(음수 좌표)
  { x: 0, y: 40, width: 1920, height: 1040 },         // 상단 작업 표시줄
  { x: 60, y: 0, width: 1860, height: 1080 },         // 왼쪽 작업 표시줄
  { x: 1920, y: -200, width: 1280, height: 720 },     // 오른쪽·위쪽 오프셋
];

test('배치: 모든 모니터 구성에서 네 모서리와 중앙 커서 모두 작업 영역 안', () => {
  const size = { width: 440, height: 700 };
  for (const a of AREAS) {
    const pts = [[a.x, a.y], [a.x + a.width - 1, a.y], [a.x, a.y + a.height - 1], [a.x + a.width - 1, a.y + a.height - 1], [a.x + a.width / 2, a.y + a.height / 2]];
    for (const [x, y] of pts) {
      const p = placeWindow({ x, y }, size, a);
      assert.ok(p.x >= a.x && p.y >= a.y && p.x + size.width <= a.x + a.width && p.y + size.height <= a.y + a.height, JSON.stringify([a, x, y, p]));
    }
  }
});

test('배치: 오른쪽 아래 커서에서는 커서 왼쪽·위로 연다', () => {
  const a = AREAS[0];
  const p = placeWindow({ x: 1900, y: 1000 }, { width: 440, height: 700 }, a);
  assert.ok(p.x + 440 <= 1900 && p.y + 700 <= 1000);
});

test('Property 1: 창이 작업 영역보다 커도 위치가 영역 안(크기는 영역으로 제한)', () => {
  for (let i = 0; i < 500; i++) {
    const a = AREAS[ri(AREAS.length)];
    const size = { width: 200 + ri(3000), height: 200 + ri(2000) };
    const c = { x: a.x + ri(a.width), y: a.y + ri(a.height) };
    const p = placeWindow(c, size, a);
    const w = Math.min(size.width, a.width); const h = Math.min(size.height, a.height);
    assert.ok(p.x >= a.x && p.y >= a.y && p.x + w <= a.x + a.width && p.y + h <= a.y + a.height);
  }
});

// ---- compat 출력 ----
test('compat: 텍스트 내용 없이 표 한 줄을 만든다', () => {
  const row = formatRow({ ok: true, proc: 'notepad', version: '11.0', cls: 'RichEditD2DPT', pattern: true, selLen: 12, text: '비밀 내용', title: '비밀 창' });
  assert.match(row, /^\| notepad \| 11\.0 \| 지원 \|/);
  assert.match(row, /12자/);
  assert.ok(!row.includes('비밀'));
});

test('compat: 미지원, 비밀번호란, 측정 실패, 파이프 문자 이스케이프', () => {
  assert.match(formatRow({ ok: true, proc: 'chrome', pattern: false }), /미지원/);
  assert.match(formatRow({ ok: true, proc: 'x', password: true, pattern: true, selLen: 5 }), /제외\(비밀번호란\)/);
  assert.ok(!formatRow({ ok: true, proc: 'x', password: true, pattern: true, selLen: 5 }).includes('5자'));
  assert.match(formatRow(null), /측정 실패/);
  assert.equal(formatRow({ ok: true, proc: 'a|b', pattern: false }).split('|').length, 7);
});

test('compat: 프로브 출력의 마지막 줄만 JSON으로 해석', () => {
  assert.deepEqual(parseProbeOutput('잡음\n{"ok":true}\n'), { ok: true });
  assert.equal(parseProbeOutput('깨짐'), null);
});
// ---- unsupportedGate ----
test('미지원 안내: 같은 프로그램은 한 번만, 이름이 없으면 PID 기준', () => {
  const { createUnsupportedGate } = require('../../src/main/unsupportedGate');
  const g = createUnsupportedGate();
  assert.equal(g.shouldNotify({ pid: 1, proc: 'chrome' }), true);
  assert.equal(g.shouldNotify({ pid: 2, proc: 'chrome' }), false);
  assert.equal(g.shouldNotify({ pid: 7, proc: '' }), true);
  assert.equal(g.shouldNotify({ pid: 7, proc: '' }), false);
  assert.equal(g.shouldNotify({ pid: 8, proc: '' }), true);
  g.reset();
  assert.equal(g.shouldNotify({ pid: 1, proc: 'chrome' }), true);
});

test('watcher: 한글 프로세스 이름 허용, 시스템 PowerShell 절대 경로 사용', () => {
  assert.equal(parseLine('{"type":"unsupported","pid":1,"proc":"한글메모"}').proc, '한글메모');
  const ps = require('../../src/main/selectionWatcher').powershellPath();
  assert.match(ps, /System32.*powershell\.exe$/i);
  if (process.platform === 'win32') assert.ok(require('node:fs').existsSync(ps), `존재하지 않는 경로: ${ps}`);
});

test('watcher: 헬퍼가 예기치 않게 종료되면 알리고, stop()으로 끝나면 알리지 않는다', () => {
  if (process.platform !== 'win32') return;
  const errors = [];
  const mk = () => { const c = fakeProc(); c.stderr = Object.assign(new EventEmitter(), { resume() { c.resumed = true; } }); return c; };
  const c1 = mk();
  const w1 = createSelectionWatcher({ scriptPath: 'x', onError: (e) => errors.push(e.message), spawnImpl: () => c1 });
  w1.start();
  assert.equal(c1.resumed, true);
  c1.emit('exit', 1);
  assert.equal(errors.length, 1);
  assert.equal(w1.running, false);
  const c2 = mk();
  const w2 = createSelectionWatcher({ scriptPath: 'x', onError: (e) => errors.push(e.message), spawnImpl: () => c2 });
  w2.start(); w2.stop(); c2.emit('exit', 0);
  assert.equal(errors.length, 1);
});

// ---- 메신저 복사 대체 경로 ----
test('복사 옵션: 꺼져 있으면 -CopyFallback 인자를 넘기지 않고, -Sta는 -File 앞에 둔다', () => {
  const { buildArgs } = require('../../src/main/selectionWatcher');
  const off = buildArgs({ scriptPath: 'x.ps1', intervalMs: 350, stableCount: 2 });
  assert.ok(!off.includes('-CopyFallback') && !off.includes('-CopyApps'));
  assert.ok(off.indexOf('-Sta') >= 0 && off.indexOf('-Sta') < off.indexOf('-File'));
  assert.equal(off[off.indexOf('-File') + 1], 'x.ps1');
  assert.ok(!buildArgs({ scriptPath: 'x', intervalMs: 1, stableCount: 1, copyFallback: 'true' }).includes('-CopyFallback'));
});

test('복사 옵션: 켜면 허용 메신저 목록만 넘기고, 잘못된 이름은 버린다', () => {
  const { buildArgs, COPY_APPS } = require('../../src/main/selectionWatcher');
  const on = buildArgs({ scriptPath: 'x', intervalMs: 350, stableCount: 2, copyFallback: true });
  assert.deepEqual(on.slice(-3), ['-CopyFallback', '-CopyApps', COPY_APPS.join(',')]);
  assert.ok(COPY_APPS.includes('KakaoTalk') && COPY_APPS.includes('Discord'));
  assert.ok(!COPY_APPS.some((a) => /^(cmd|powershell|pwsh|WindowsTerminal|Code|Kiro)$/i.test(a)), '터미널·편집기는 허용하지 않는다');
  const bad = buildArgs({ scriptPath: 'x', intervalMs: 1, stableCount: 1, copyFallback: true, copyApps: ['KakaoTalk', 'a,b', 'x;rm', 5, ''] });
  assert.equal(bad[bad.indexOf('-CopyApps') + 1], 'KakaoTalk');
  assert.ok(!buildArgs({ scriptPath: 'x', intervalMs: 1, stableCount: 1, copyFallback: true, copyApps: [] }).includes('-CopyFallback'));
});

test('복사 옵션: via는 copy만 구분하고 나머지는 uia로 본다', () => {
  assert.equal(parseLine('{"type":"selection","text":"a","pid":1,"via":"copy"}').via, 'copy');
  assert.equal(parseLine('{"type":"selection","text":"a","pid":1,"via":"evil"}').via, 'uia');
  assert.equal(parseLine('{"type":"selection","text":"a","pid":1}').via, 'uia');
});

test('watcher: start마다 옵션을 다시 읽고, restart는 실행 중일 때만 다시 띄운다', () => {
  if (process.platform !== 'win32') return;
  const calls = [];
  let copy = false;
  const w = createSelectionWatcher({
    scriptPath: 'x', getOptions: () => ({ copyFallback: copy }),
    spawnImpl: (cmd, args) => { calls.push(args); const c = fakeProc(); c.stderr = Object.assign(new EventEmitter(), { resume() {} }); return c; },
  });
  w.restart();
  assert.equal(calls.length, 0);
  w.start();
  copy = true;
  w.restart();
  assert.equal(calls.length, 2);
  assert.ok(!calls[0].includes('-CopyFallback'));
  assert.ok(calls[1].includes('-CopyFallback'));
  w.stop();
});

test('설정: copyFallback은 명시적 true만 인정한다', () => {
  const { sanitize, DEFAULTS } = require('../../src/main/settings');
  assert.equal(DEFAULTS.copyFallback, false);
  for (const v of ['true', 1, 'yes', null, undefined, {}]) assert.equal(sanitize({ copyFallback: v }).copyFallback, false);
  assert.equal(sanitize({ copyFallback: true }).copyFallback, true);
});
test('compat: 커서 아래 요소에서 읽힘, 메신저는 복사 옵션 필요로 표시, 텍스트는 출력하지 않음', () => {
  const point = formatRow({ ok: true, proc: 'Discord', pattern: true, selLen: 0, pointOk: true, pointProc: 'Discord', pointPattern: true, pointSelLen: 9, pointDepth: 2, pointCls: 'Chrome_RenderWidgetHostHWND', text: '비밀' });
  assert.match(point, /^\| Discord \| - \| 지원\(커서 아래\) \|/);
  assert.match(point, /상위 2단계/);
  assert.ok(!point.includes('비밀'));
  const kakao = formatRow({ ok: true, proc: 'KakaoTalk', pattern: true, selLen: 0, pointOk: true, pointProc: 'KakaoTalk', pointPattern: false });
  assert.match(kakao, /\| KakaoTalk \| - \| 복사 옵션 필요 \|/);
  assert.match(formatRow({ ok: true, proc: 'notepad', pattern: false, pointOk: true, pointProc: 'notepad', pointPassword: true, pointSelLen: 3 }), /제외\(비밀번호란\)/);
  assert.match(formatRow({ ok: false, pointOk: true, pointProc: 'x', pointPattern: false }), /\| x \| - \| 미지원 \|/);
});
