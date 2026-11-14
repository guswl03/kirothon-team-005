'use strict';
// Kiro CLI 비대화형 모드 어댑터. KIRO_API_KEY(또는 로그인된 세션)가 필요하다.
// 도구는 신뢰하지 않는다(--trust-tools 미지정) -> 텍스트 생성만 수행. 프롬프트는 stdin으로 전달(셸 미사용).
const { spawn } = require('node:child_process');

const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

function createKiroProvider(opts = {}) {
  const cmd = opts.command || process.env.KIRO_CLI_PATH || 'kiro-cli';
  const timeoutMs = opts.timeoutMs || 120000;
  const spawnImpl = opts.spawnImpl || spawn;
  return {
    id: 'kiro',
    label: 'Kiro CLI',
    external: true,
    generate({ prompt, signal }) {
      return new Promise((resolve, reject) => {
        let child;
        try {
          child = spawnImpl(cmd, ['chat', '--v3', '--no-interactive'], { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
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

module.exports = { createKiroProvider };