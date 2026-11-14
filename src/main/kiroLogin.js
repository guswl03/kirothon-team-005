'use strict';
// Kiro CLI 로그인 흐름. Electron에 의존하지 않는다(테스트에서 실행 함수와 타이머를 주입).
// - 로그인 방법을 인자로 정해 kiro-cli login을 창 없이 실행한다(--social github|google, --license free).
//   kiro-cli가 브라우저를 직접 연다. 출력에 로그인 주소와 일회용 코드가 나오면 그것만 꺼내 화면에 보여 준다.
// - 'terminal' 방법은 새 콘솔 창에서 kiro-cli login을 띄워 사용자가 직접 고르게 한다(대체 경로).
// - 진행 중에는 pollMs마다 check()(= kiro-cli whoami)로 연결을 확인하고, 연결되면 끝낸다.
// - 계정 정보와 CLI 출력 원문은 상태에 담지 않는다(주소와 코드만).

const METHODS = {
  github: ['login', '--social', 'github'],
  google: ['login', '--social', 'google'],
  builder: ['login', '--license', 'free'],
  terminal: ['login'],
};

// 로그인 주소로 허용하는 호스트(이 도메인이거나 그 하위 도메인)
const LOGIN_HOSTS = ['kiro.dev', 'aws.amazon.com', 'awsapps.com', 'signin.aws', 'amazoncognito.com', 'github.com', 'accounts.google.com'];
const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

function isAllowedLoginUrl(u) {
  let url;
  try { url = new URL(String(u)); } catch { return false; }
  if (url.protocol !== 'https:' || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return LOGIN_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
}

/** CLI 출력에서 허용된 로그인 주소와 일회용 코드(XXXX-XXXX)만 꺼낸다. */
function extractLogin(text) {
  const clean = String(text || '').replace(ANSI, '');
  const url = (clean.match(/https:\/\/[^\s"'<>)\]]+/g) || []).find(isAllowedLoginUrl) || '';
  const m = clean.match(/\b[A-Z0-9]{4}-[A-Z0-9]{4}\b/);
  return { url, code: m ? m[0] : '' };
}

/**
 * @param {object} o
 * @param {() => string} o.getCommand       kiro-cli 경로
 * @param {Function} o.spawnImpl            child_process.spawn 호환
 * @param {() => Promise<{status:string}>} o.check   연결 확인(checkKiro)
 * @param {(s:object) => void} [o.onChange] 상태가 바뀔 때마다 호출
 */
function createKiroLogin({ getCommand, spawnImpl, check, onChange = () => {}, pollMs = 2000, timeoutMs = 5 * 60 * 1000,
  setTimer = setTimeout, clearTimer = clearTimeout, setRepeat = setInterval, clearRepeat = clearInterval }) {
  let state = { phase: 'idle', method: '', url: '', code: '', message: '' };
  let child = null;
  let poll = null;
  let limit = null;
  let checking = false;
  let out = '';
  let run = 0;   // 시도 번호(이전 시도의 늦은 콜백 무시)

  const set = (patch) => { state = { ...state, ...patch }; onChange({ ...state }); };
  const stopTimers = () => { if (poll) clearRepeat(poll); if (limit) clearTimer(limit); poll = null; limit = null; };
  const killChild = () => { if (child && child.kill && !child.detachedConsole) { try { child.kill(); } catch { /* ignore */ } } child = null; };
  const finish = (patch) => { stopTimers(); killChild(); set(patch); };

  async function probe(my) {
    if (checking || my !== run || state.phase !== 'waiting') return;
    checking = true;
    let r = null;
    try { r = await check(); } catch { r = null; } finally { checking = false; }
    if (my !== run || state.phase !== 'waiting') return;
    if (r && r.status === 'connected') finish({ phase: 'connected', message: 'Kiro에 연결됐어요.' });
  }

  function start(method) {
    if (!Object.prototype.hasOwnProperty.call(METHODS, method)) return { ok: false, message: '알 수 없는 로그인 방법이에요.' };
    if (state.phase === 'waiting') return { ok: false, message: '이미 로그인을 진행하고 있어요.' };
    run += 1;
    const my = run;
    out = '';
    set({ phase: 'waiting', method, url: '', code: '', message: method === 'terminal'
      ? '새로 열린 창에서 로그인 방법을 고르고, 브라우저에서 로그인을 마쳐 주세요.'
      : '브라우저에서 로그인을 마치면 자동으로 넘어가요.' });
    const terminal = method === 'terminal';
    try {
      child = spawnImpl(getCommand(), METHODS[method], terminal
        // 콘솔 앱을 detached로 띄우면 Windows가 새 콘솔 창을 만든다. 출력은 사용자가 그 창에서 본다.
        ? { shell: false, detached: true, windowsHide: false, stdio: 'ignore' }
        : { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      finish({ phase: 'failed', message: 'Kiro CLI를 실행하지 못했어요. 설치되어 있는지 확인해 주세요.' });
      return { ok: false };
    }
    if (terminal) { child.detachedConsole = true; if (child.unref) child.unref(); }
    const onData = (d) => {
      if (my !== run || out.length > 8000) return;
      out += String(d);
      const found = extractLogin(out);
      if ((found.url && found.url !== state.url) || (found.code && found.code !== state.code)) {
        set({ url: found.url || state.url, code: found.code || state.code });
      }
    };
    if (!terminal) {
      if (child.stdout) child.stdout.on('data', onData);
      if (child.stderr) child.stderr.on('data', onData);
    }
    child.on('error', (e) => {
      if (my !== run) return;
      finish({ phase: 'failed', message: e && e.code === 'ENOENT' ? 'Kiro CLI가 설치되어 있지 않아요.' : 'Kiro CLI를 실행하지 못했어요.' });
    });
    child.on('exit', (code) => {
      if (my !== run || state.phase !== 'waiting') return;
      if (!terminal) child = null;
      const already = /already logged in/i.test(out);
      // 정상 종료나 '이미 로그인됨'이면 바로 확인한다. 실패 종료면 CLI 출력 원문 대신 짧은 안내만 남긴다.
      if (code === 0 || already || terminal) { probe(my); return; }
      finish({ phase: 'failed', message: `로그인을 마치지 못했어요(종료 코드 ${code}). 다시 시도하거나 '터미널에서 로그인'을 써 보세요.` });
    });
    poll = setRepeat(() => probe(my), pollMs);
    limit = setTimer(() => { if (my === run && state.phase === 'waiting') finish({ phase: 'timeout', message: '5분 안에 로그인이 끝나지 않았어요. 다시 시도해 주세요.' }); }, timeoutMs);
    return { ok: true };
  }

  function cancel() {
    if (state.phase !== 'waiting') return false;
    run += 1;
    finish({ phase: 'cancelled', message: '로그인을 취소했어요.' });
    return true;
  }

  return {
    start,
    cancel,
    get state() { return { ...state }; },
    reset() { if (state.phase !== 'waiting') set({ phase: 'idle', method: '', url: '', code: '', message: '' }); },
  };
}

/** 이 상태면 분석하지 않고 로그인 화면으로 보낸다. 확인 중(checking)은 막지 않는다. */
function needsLogin(status) {
  return status === 'not_installed' || status === 'not_logged_in' || status === 'error';
}

module.exports = { createKiroLogin, extractLogin, isAllowedLoginUrl, needsLogin, METHODS, LOGIN_HOSTS };
