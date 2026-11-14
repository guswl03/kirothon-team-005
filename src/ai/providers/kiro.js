'use strict';
// Kiro CLI 비대화형 모드 어댑터. KIRO_API_KEY(또는 로그인된 세션)가 필요하다.
// 도구는 신뢰하지 않는다(--trust-tools 미지정) -> 텍스트 생성만 수행. 프롬프트는 stdin으로 전달(셸 미사용).
// V3 headless는 작업 폴더의 .kiro 설정·AGENTS.md·hooks를 읽으므로, 앱 전용 빈 폴더에서 실행해 섞이지 않게 한다.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const DEFAULT_TIMEOUT_MS = 120000;

function timeoutFrom(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1000 ? Math.floor(n) : 0;
}

/** 저장소 설정이 섞이지 않도록 OS 임시 폴더 아래의 빈 작업 폴더를 만든다. */
function isolatedCwd(mkdir = fs.mkdirSync) {
  const dir = path.join(os.tmpdir(), 'conversation-cheatsheet-kiro');
  mkdir(dir, { recursive: true });
  return dir;
}

/**
 * 실행할 kiro-cli 경로. KIRO_CLI_PATH > PATH의 kiro-cli 순서이고, Windows에서 설치 직후라
 * PATH가 갱신되지 않았으면 기본 설치 위치(%LOCALAPPDATA%\Kiro-Cli\kiro-cli.exe)를 쓴다.
 */
function resolveKiroCommand({ env = process.env, exists = fs.existsSync, platform = process.platform } = {}) {
  if (env.KIRO_CLI_PATH) return env.KIRO_CLI_PATH;
  if (platform === 'win32' && env.LOCALAPPDATA) {
    const local = path.join(env.LOCALAPPDATA, 'Kiro-Cli', 'kiro-cli.exe');
    const onPath = String(env.PATH || env.Path || '').split(path.delimiter)
      .some((d) => d && exists(path.join(d, 'kiro-cli.exe')));
    if (!onPath && exists(local)) return local;
  }
  return 'kiro-cli';
}

/**
 * Kiro CLI 연결 상태를 확인한다. `kiro-cli whoami`가 성공하면 로그인 세션, 아니면 KIRO_API_KEY 여부로 판단한다.
 * @returns {Promise<{status:'connected'|'not_installed'|'not_logged_in'|'error', auth?:string, message:string}>}
 */
function checkKiro(opts = {}) {
  const env = opts.env || process.env;
  const cmd = opts.command || resolveKiroCommand({ env });
  const spawnImpl = opts.spawnImpl || spawn;
  const timeoutMs = opts.timeoutMs || 15000;
  return new Promise((resolve) => {
    let child;
    let done = false;
    const finish = (v) => { if (done) return; done = true; clearTimeout(timer); resolve(v); };
    const timer = setTimeout(() => { try { child && child.kill(); } catch { /* ignore */ } finish({ status: 'error', message: 'Kiro CLI 확인 시간이 초과됐어요.' }); }, timeoutMs);
    try {
      child = spawnImpl(cmd, ['whoami'], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      finish({ status: 'error', message: `Kiro CLI를 실행하지 못했어요. ${e.message}` });
      return;
    }
    if (child.stdout) child.stdout.on('data', () => { /* 계정 정보는 화면·로그에 남기지 않는다 */ });
    if (child.stderr) child.stderr.on('data', () => {});
    child.on('error', (e) => finish(e && e.code === 'ENOENT'
      ? { status: 'not_installed', message: 'Kiro CLI가 설치되어 있지 않아요.' }
      : { status: 'error', message: `Kiro CLI를 실행하지 못했어요. ${(e && e.message) || ''}`.trim() }));
    child.on('close', (code) => {
      if (code === 0) finish({ status: 'connected', auth: 'login', message: 'Kiro CLI에 로그인되어 있어요.' });
      else if (env.KIRO_API_KEY) finish({ status: 'connected', auth: 'api_key', message: 'KIRO_API_KEY로 연결해요.' });
      else finish({ status: 'not_logged_in', message: '터미널에서 kiro-cli login으로 로그인해 주세요.' });
    });
  });
}

function createKiroProvider(opts = {}) {
  const cmd = opts.command || resolveKiroCommand();
  const timeoutMs = timeoutFrom(opts.timeoutMs) || timeoutFrom(process.env.KIRO_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS;
  const spawnImpl = opts.spawnImpl || spawn;
  const getCwd = opts.getCwd || (() => isolatedCwd());
  return {
    id: 'kiro',
    label: 'Kiro CLI',
    external: true,
    timeoutMs,
    generate({ prompt, signal }) {
      return new Promise((resolve, reject) => {
        let child;
        try {
          child = spawnImpl(cmd, ['chat', '--v3', '--no-interactive'], { cwd: getCwd(), shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
        } catch (e) { return reject(e); }
        let out = '', err = '', done = false;
        const finish = (fn, v) => { if (done) return; done = true; clearTimeout(timer); if (signal) signal.removeEventListener('abort', onAbort); fn(v); };
        const kill = () => { try { child.kill(); } catch { /* ignore */ } };
        const timer = setTimeout(() => { kill(); finish(reject, new Error('Kiro CLI 응답 시간이 초과됐어요')); }, timeoutMs);
        const onAbort = () => { kill(); const e = new Error('취소됨'); e.name = 'AbortError'; finish(reject, e); };
        if (signal) { if (signal.aborted) return onAbort(); signal.addEventListener('abort', onAbort, { once: true }); }
        child.stdout.on('data', (d) => { out += d; });
        child.stderr.on('data', (d) => { err += d; });
        child.on('error', (e) => finish(reject, e.code === 'ENOENT'
          ? new Error('kiro-cli를 찾을 수 없어요. 설치 후 PATH에 추가하거나 KIRO_CLI_PATH를 설정하세요.') : e));
        child.on('close', (code) => {
          const text = out.replace(ANSI, '').trim();
          if (code === 0 && text) finish(resolve, text);
          else finish(reject, new Error(`Kiro CLI 실행 실패(종료 코드 ${code}). ${err.replace(ANSI, '').trim().slice(0, 200)}`));
        });
        child.stdin.on('error', () => { /* 조기 종료 시 EPIPE 무시 */ });
        child.stdin.end(prompt);
      });
    },
  };
}

module.exports = { createKiroProvider, isolatedCwd, resolveKiroCommand, checkKiro };
