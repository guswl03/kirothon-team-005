'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { kiroReady, quantile } = require('../../scripts/measure-kiro');

/** 명령별 결과를 정해 둔 가짜 spawnSync */
const fake = (map) => (cmd, args) => map[args[0]] || { status: 1 };

test('kiroReady: 로그인 세션이 있으면 API 키 없이도 준비됨', () => {
  const r = kiroReady(fake({ '--version': { status: 0, stdout: 'kiro-cli 3.3.0\n' }, whoami: { status: 0, stdout: 'user' } }), {});
  assert.deepEqual(r, { ok: true, version: 'kiro-cli 3.3.0', auth: '로그인 세션' });
});

test('kiroReady: 로그인이 없으면 KIRO_API_KEY로, 둘 다 없으면 안내', () => {
  const noLogin = fake({ '--version': { status: 0, stdout: 'v' }, whoami: { status: 1 } });
  assert.equal(kiroReady(noLogin, { KIRO_API_KEY: 'x' }).auth, 'KIRO_API_KEY');
  assert.match(kiroReady(noLogin, {}).why, /kiro-cli login/);
});

test('kiroReady: kiro-cli가 없으면 설치 안내', () => {
  const r = kiroReady(() => ({ error: Object.assign(new Error('x'), { code: 'ENOENT' }) }), {});
  assert.equal(r.ok, false);
  assert.match(r.why, /ENOENT/);
});

test('quantile: 중앙값과 빈 목록', () => {
  assert.equal(quantile([30, 10, 20], 0.5), 20);
  assert.equal(quantile([], 0.5), 0);
});

test('measure-kiro: kiro-cli를 찾을 수 없으면 종료 코드 2', () => {
  const env = { ...process.env, KIRO_CLI_PATH: 'kiro-cli-does-not-exist-xyz' };
  const r = spawnSync(process.execPath, [path.join(__dirname, '..', '..', 'scripts', 'measure-kiro.js')], { env, encoding: 'utf8', windowsHide: true, timeout: 30000 });
  assert.equal(r.status, 2);
  assert.match(r.stdout, /측정을 건너뜁니다/);
});
