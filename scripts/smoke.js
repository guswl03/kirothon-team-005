'use strict';
// Electron 앱을 스모크 모드로 실행하고 결과 JSON을 출력한다. (네트워크 필요: 위키백과 검색)
// --gate: Kiro 로그인 화면 흐름(첫 화면, 나중에 하기, 분석 시 다시 로그인 화면)을 확인한다.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const electron = require('electron');
const out = path.join(os.tmpdir(), `cc-smoke-${process.pid}.json`);
const r = spawnSync(electron, ['.'], { cwd: path.join(__dirname, '..'), env: { ...process.env, CC_SMOKE: '1', CC_SMOKE_OUT: out, ...(process.argv.includes('--gate') ? { CC_SMOKE_GATE: '1' } : {}) }, timeout: 90000 });
let res = { ok: false, error: 'no output', status: r.status };
try { res = JSON.parse(fs.readFileSync(out, 'utf8')); fs.unlinkSync(out); } catch { /* keep default */ }
console.log(JSON.stringify(res, null, 2));
process.exit(res.ok ? 0 : 1);