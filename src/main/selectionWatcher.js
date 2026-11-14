'use strict';
// UI Automation 헬퍼(PowerShell) 프로세스를 관리한다. 자동 분석이 켜진 동안에만 실행된다.
const path = require('node:path');
const { spawn } = require('node:child_process');

const DEFAULTS = { intervalMs: 350, stableCount: 2 };
const PROC_NAME = /^[\p{L}\p{N}_.\- ]{1,64}$/u;

// 작업 디렉터리의 동명 실행 파일이 먼저 잡히지 않도록 시스템 PowerShell의 절대 경로를 쓴다.
function powershellPath() {
  const root = process.env.SystemRoot || 'C:\\Windows';
  return path.join(root, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
}

function clampInt(v, min, max, fallback) {
  const n = Number(v);
  return Number.isInteger(n) ? Math.min(Math.max(n, min), max) : fallback;
}

/**
 * 헬퍼가 내보낸 한 줄을 해석한다. 알려진 필드만 복사하므로 미지원 메시지에는 텍스트가 실릴 수 없다.
 * type이 없는 줄은 이전 형식의 selection으로 취급한다.
 * @returns {{type:'selection',text:string,pid:number}|{type:'unsupported',pid:number,proc:string}|null}
 */
function parseLine(line) {
  let o;
  try { o = JSON.parse(line); } catch { return null; }
  if (!o || typeof o !== 'object') return null;
  const pid = Number(o.pid) || 0;
  if (o.type === 'unsupported') {
    const proc = typeof o.proc === 'string' && PROC_NAME.test(o.proc) ? o.proc : '';
    return { type: 'unsupported', pid, proc };
  }
  if ((o.type === 'selection' || o.type === undefined) && typeof o.text === 'string') {
    return { type: 'selection', text: o.text, pid };
  }
  return null;
}

function createSelectionWatcher({ scriptPath, onSelection, onUnsupported, onError, intervalMs, stableCount, spawnImpl = spawn }) {
  let child = null;
  let buf = '';
  const interval = clampInt(intervalMs, 100, 2000, DEFAULTS.intervalMs);
  const stable = clampInt(stableCount, 1, 10, DEFAULTS.stableCount);
  return {
    get running() { return Boolean(child); },
    start() {
      if (child) return;
      if (process.platform !== 'win32') { onError && onError(new Error('자동 선택 감지는 Windows에서만 지원돼요.')); return; }
      child = spawnImpl(powershellPath(), [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath,
        '-IntervalMs', String(interval), '-StableCount', String(stable),
      ], { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          const msg = line && parseLine(line);
          if (!msg) continue;
          if (msg.type === 'selection') onSelection && onSelection({ text: msg.text, pid: msg.pid });
          else onUnsupported && onUnsupported({ pid: msg.pid, proc: msg.proc });
        }
        if (buf.length > 20000) buf = '';
      });
      if (child.stderr) child.stderr.resume();          // 파이프가 막히지 않게 비우기만 한다(내용은 읽지 않음)
      const me = child;
      child.on('error', (e) => { if (child === me) child = null; onError && onError(e); });
      child.on('exit', (code) => {
        if (child !== me) return;                         // stop()으로 끝낸 경우는 알리지 않는다
        child = null;
        onError && onError(new Error(`선택 감지 헬퍼가 종료됐어요(코드 ${code})`));
      });
    },
    stop() {
      if (!child) return;
      try { child.kill(); } catch { /* ignore */ }
      child = null; buf = '';
    },
  };
}

module.exports = { createSelectionWatcher, parseLine, clampInt, powershellPath, DEFAULTS };