'use strict';
// UI Automation 헬퍼(PowerShell) 프로세스를 관리한다. 자동 분석이 켜진 동안에만 실행된다.
const { spawn } = require('node:child_process');

function parseLine(line) {
  try {
    const o = JSON.parse(line);
    if (o && typeof o.text === 'string') return { text: o.text, pid: Number(o.pid) || 0 };
  } catch { /* 무시 */ }
  return null;
}

function createSelectionWatcher({ scriptPath, onSelection, onError, spawnImpl = spawn }) {
  let child = null;
  let buf = '';
  return {
    get running() { return Boolean(child); },
    start() {
      if (child) return;
      if (process.platform !== 'win32') { onError && onError(new Error('자동 선택 감지는 Windows에서만 지원돼요.')); return; }
      child = spawnImpl('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
        { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim();
          buf = buf.slice(i + 1);
          const sel = line && parseLine(line);
          if (sel) onSelection(sel);
        }
        if (buf.length > 20000) buf = '';
      });
      child.on('error', (e) => { child = null; onError && onError(e); });
      child.on('exit', () => { child = null; });
    },
    stop() {
      if (!child) return;
      try { child.kill(); } catch { /* ignore */ }
      child = null; buf = '';
    },
  };
}

module.exports = { createSelectionWatcher, parseLine };