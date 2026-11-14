'use strict';
const path = require('node:path');
const {
  app, BrowserWindow, Tray, Menu, ipcMain, clipboard, dialog, globalShortcut, nativeImage, screen, session, shell,
} = require('electron');
const { createService } = require('../core/service');
const { createDedupe, validateInput } = require('../core/textGuard');
const { createKiroProvider, checkKiro } = require('../ai/providers/kiro');
const { createOpenAiProvider } = require('../ai/providers/openai');
const { createSettings, PROVIDERS } = require('./settings');
const { createSelectionWatcher } = require('./selectionWatcher');
const { placeWindow } = require('./windowPlacement');
const { makeIconPng } = require('./icon');

const WIN_SIZE = { width: 440, height: 700 };
const SHORTCUT = 'Control+Alt+Space';

let win = null;
let tray = null;
let settings;
let service;
let watcher;
const smokeLog = [];
const dedupe = createDedupe(4000);
const providers = { kiro: createKiroProvider(), openai: createOpenAiProvider() };

// Kiro CLI 연결 상태: checking | connected | not_installed | not_logged_in | error
let kiroStatus = { status: 'checking', message: 'Kiro CLI 연결을 확인하는 중이에요.' };

async function refreshKiroStatus() {
  kiroStatus = { status: 'checking', message: 'Kiro CLI 연결을 확인하는 중이에요.' };
  pushState();
  kiroStatus = await checkKiro();
  pushState();
  return kiroStatus;
}

// ---------- 공급자 선택 ----------
function resolveProvider() {
  const pref = settings.get().provider;
  if (process.env.CC_SMOKE) return smokeProvider;
  if (pref !== 'auto' && providers[pref]) return providers[pref];
  if (providers.openai.configured && kiroStatus.status !== 'connected' && !process.env.KIRO_API_KEY) return providers.openai;
  return kiroProvider();
}

/** 기본 공급자는 Kiro. 연결이 확인되지 않았으면 호출하지 않고 연결 방법을 오류로 안내한다. */
function kiroProvider() {
  if (process.env.KIRO_API_KEY || !['not_installed', 'not_logged_in'].includes(kiroStatus.status)) return providers.kiro;
  return {
    ...providers.kiro,
    async generate() {
      throw new Error(`Kiro에 연결되지 않았어요. ${kiroStatus.message} 그다음 창 아래의 '다시 확인'을 눌러 주세요.`);
    },
  };
}

// 스모크 테스트(npm run smoke) 전용 고정 응답. 외부 AI 없이 화면 렌더링만 확인한다. 일반 실행에서는 쓰지 않는다.
const smokeProvider = {
  id: 'smoke', label: '스모크 테스트 고정 응답', external: false,
  async generate() {
    const s = (text) => ({ text, basis: 'general', sourceIds: [] });
    const q = (question) => ({ question, answers: [{ text: '답변 1', sourceIds: [] }, { text: '답변 2', sourceIds: [] }] });
    return JSON.stringify({
      context: '스모크 테스트', topic: '스모크 테스트',
      terms: [{ term: '용어 1', meaning: '뜻 1', inThisText: '의미 1', confidence: 'high', sourceIds: [] }, { term: '용어 2', meaning: '뜻 2', confidence: 'low', sourceIds: [] }],
      statements: ['문장 1', '문장 2', '문장 3', '문장 4', '문장 5'].map(s),
      questions: ['질문 1', '질문 2', '질문 3', '질문 4', '질문 5'].map(q),
      topicSwitches: [1, 2, 3].map((i) => ({ topic: `화제 ${i}`, line: `전환 문장 ${i}`, sourceIds: [] })),
      keyFacts: [],
    });
  },
};

function appState() {
  const s = settings.get();
  const p = resolveProvider();
  return {
    ...s,
    providers: PROVIDERS,
    activeProvider: { id: p.id, label: p.label, external: p.external },
    kiro: { status: kiroStatus.status, auth: kiroStatus.auth || '', message: kiroStatus.message },
    autoSupported: process.platform === 'win32',
    watching: Boolean(watcher && watcher.running),
    shortcut: SHORTCUT,
  };
}

function pushState() { if (win && !win.isDestroyed()) win.webContents.send('app-state', appState()); }
function toRenderer(channel, payload) { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); }

// ---------- 창 ----------
function createWindow() {
  win = new BrowserWindow({
    ...WIN_SIZE, minWidth: 380, minHeight: 480, show: false, alwaysOnTop: true, skipTaskbar: false,
    title: '대화 치트키', autoHideMenuBar: true, backgroundColor: '#f7f7fb',
    icon: nativeImage.createFromBuffer(makeIconPng(64)),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true,
      spellcheck: false,
    },
  });
  win.setMenu(null);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  // 닫기 버튼은 종료가 아니라 숨김(트레이 상주)
  win.on('close', (e) => { if (!app.isQuitting) { e.preventDefault(); win.hide(); } });
}

function showNearCursor({ focus = false } = {}) {
  if (!win || win.isDestroyed()) return;
  const cursor = screen.getCursorScreenPoint();
  const area = screen.getDisplayNearestPoint(cursor).workArea;
  const [w, h] = win.getSize();
  const size = { width: Math.min(w, area.width), height: Math.min(h, area.height) };
  const pos = placeWindow(cursor, size, area);
  win.setBounds({ ...pos, ...size });
  if (focus) { win.show(); win.focus(); } else { win.showInactive(); }
}

function showWindow() {
  if (!win) return;
  if (!win.isVisible()) { win.show(); }
  win.focus();
}

// ---------- 자동 분석 ----------
async function setAutoAnalyze(on) {
  if (on) {
    if (process.platform !== 'win32') {
      dialog.showMessageBox(win, { type: 'info', message: '자동 선택 감지는 Windows에서만 지원돼요. 붙여넣기 입력을 사용해 주세요.' });
      return false;
    }
    if (!settings.get().consentAccepted) {
      const p = resolveProvider();
      const { response } = await dialog.showMessageBox(win && win.isVisible() ? win : undefined, {
        type: 'question', buttons: ['동의하고 켜기', '취소'], defaultId: 1, cancelId: 1, title: '자동 분석 안내',
        message: '선택한 텍스트가 검색과 AI 처리에 사용돼요',
        detail: [
          '• 드래그로 선택한 텍스트만 읽어요. 전체 화면, 문서, 클립보드는 수집하지 않아요.',
          '• 비밀번호 입력란은 읽지 않아요.',
          '• 선택한 내용은 위키백과 검색 요청에 포함돼요.',
          `• 문장 생성: ${p.label}${p.external ? ' (선택한 내용이 외부 서비스로 전달돼요)' : ' (이 PC에서만 처리해요)'}`,
          '• 앱은 선택 내용과 결과를 파일로 저장하거나 로그에 남기지 않아요. 외부 서비스의 보관 정책은 각 제공자 기준이에요.',
          '• 언제든 트레이 메뉴나 창에서 일시 중지할 수 있어요.',
        ].join('\n'),
      });
      if (response !== 0) { pushState(); return false; }
      settings.set({ consentAccepted: true });
    }
    settings.set({ autoAnalyze: true });
    watcher.start();
  } else {
    settings.set({ autoAnalyze: false });
    watcher.stop();
  }
  pushState();
  rebuildTray();
  return settings.get().autoAnalyze;
}

function ownPids() {
  try { return new Set(app.getAppMetrics().map((m) => m.pid)); } catch { return new Set(); }
}

function onSelection({ text, pid }) {
  if (!settings.get().autoAnalyze) return;
  if (ownPids().has(pid)) return;                 // 결과 창 안의 선택은 새 분석을 만들지 않는다
  if (win && win.isFocused()) return;
  const v = validateInput(text);
  if (!v.ok && v.reason !== 'too_long') return;   // 빈/너무 짧은 선택은 무시
  if (!dedupe.shouldProcess(v.ok ? v.text : text.slice(0, 50))) return;
  showNearCursor();
  if (!v.ok) { toRenderer('svc-event', { type: 'invalid', ...v, requestId: 0, incomingText: text.slice(0, 200) }); return; }
  toRenderer('incoming', { text: v.text, source: 'selection' });
  service.analyze(v.text, { tone: settings.get().tone });
}

function analyzeClipboard() {
  const v = validateInput(clipboard.readText());
  showNearCursor({ focus: true });
  if (!v.ok) { toRenderer('svc-event', { type: 'invalid', ...v, requestId: 0 }); return; }
  toRenderer('incoming', { text: v.text, source: 'clipboard' });
  service.analyze(v.text, { tone: settings.get().tone });
}

// ---------- 트레이 ----------
function rebuildTray() {
  if (!tray) return;
  const auto = settings.get().autoAnalyze;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '창 열기', click: showWindow },
    { label: `자동 분석 ${auto ? '일시 중지' : '켜기'}`, click: () => setAutoAnalyze(!auto) },
    { label: `클립보드 내용 분석 (${SHORTCUT})`, click: analyzeClipboard },
    { type: 'separator' },
    { label: '종료', click: () => { app.isQuitting = true; app.quit(); } },
  ]));
}

function createTray() {
  tray = new Tray(nativeImage.createFromBuffer(makeIconPng(32)));
  tray.setToolTip('대화 치트키');
  tray.on('click', showWindow);
  rebuildTray();
}

// ---------- IPC ----------
function guard(handler) {
  return async (event, ...args) => {
    if (!win || event.sender !== win.webContents) throw new Error('허용되지 않은 요청');
    return handler(...args);
  };
}
const isStr = (v, max) => typeof v === 'string' && v.length <= max;

function registerIpc() {
  ipcMain.handle('get-state', guard(() => appState()));
  ipcMain.handle('analyze', guard((p) => {
    if (!p || !isStr(p.text, 5000)) return { ok: false, message: '잘못된 입력' };
    const tone = p.tone === 'work' ? 'work' : 'casual';
    settings.set({ tone });
    return service.analyze(p.text, { tone, note: isStr(p.note, 300) ? p.note : '', direction: isStr(p.direction, 80) ? p.direction : '' });
  }));
  ipcMain.handle('retry', guard(() => service.retry()));
  ipcMain.handle('set-tone', guard((tone) => { const t = tone === 'work' ? 'work' : 'casual'; settings.set({ tone: t }); pushState(); return service.getSession() ? service.changeTone(t) : { ok: true }; }));
  ipcMain.handle('regenerate', guard((p) => service.regenerate(p && p.kind, p && p.index, p && isStr(p.direction, 80) ? p.direction : '')));
  ipcMain.handle('followup', guard((q) => (isStr(q, 5000) ? service.followup(q) : { ok: false, message: '잘못된 입력' })));
  ipcMain.handle('set-auto', guard((on) => setAutoAnalyze(on === true)));
  ipcMain.handle('set-provider', guard((id) => { settings.set({ provider: PROVIDERS.includes(id) ? id : 'auto' }); pushState(); return appState(); }));
  ipcMain.handle('check-kiro', guard(async () => { await refreshKiroStatus(); return appState(); }));
  ipcMain.handle('copy', guard((text) => { if (isStr(text, 5000)) clipboard.writeText(text); return true; }));
  ipcMain.handle('hide', guard(() => { win.hide(); }));
  ipcMain.handle('open-link', guard((url) => {
    // 현재 세션의 검색 결과 링크(https)만 연다.
    const s = service.getSession();
    const ok = s && s.sources.some((x) => x.url === url) && /^https:\/\//i.test(url);
    if (ok) shell.openExternal(url);
    return Boolean(ok);
  }));
}


// ---------- 스모크 테스트(npm run smoke): 실제 창에서 분석 흐름을 한 번 실행하고 결과를 파일로 남긴다 ----------
function runSmoke() {
  const fs = require('node:fs');
  const out = process.env.CC_SMOKE_OUT;
  const finish = (obj, code) => { try { fs.writeFileSync(out, JSON.stringify(obj, null, 2)); } catch { /* ignore */ } app.exit(code); };
  const timer = setTimeout(() => finish({ ok: false, error: 'timeout' }, 1), 60000);
  win.webContents.on('console-message', (_e, _l, msg) => smokeLog.push('console:' + msg));
  win.webContents.once('did-finish-load', async () => {
    try {
      if (process.env.CC_SMOKE_SHOT) win.showInactive();
      const r = await win.webContents.executeJavaScript(`(async () => {
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
        document.getElementById('text').value = '양자 컴퓨터';
        document.getElementById('analyze').click();
        for (let i = 0; i < 100; i++) {
          await wait(300);
          if (!document.getElementById('results').hidden || !document.getElementById('error').hidden) break;
        }
        const n = (id) => document.getElementById(id).children.length;
        return {
          hasApi: typeof window.api === 'object', hasNode: typeof require !== 'undefined' || typeof process !== 'undefined',
          resultsVisible: !document.getElementById('results').hidden,
          error: document.getElementById('error').hidden ? '' : document.getElementById('errorText').textContent,
          hero: document.getElementById('heroText').textContent,
          terms: n('terms'), meaningVisible: !document.getElementById('meaning').hidden, genBy: document.getElementById('genBy').textContent,
          statements: n('statements'), questions: n('questions'), switches: n('switches'), sources: n('sources'),
          searchNote: document.getElementById('srcStatus').textContent,
          provider: document.getElementById('providerNote').textContent,
          status: document.getElementById('status').textContent, notice: document.getElementById('notice').textContent,
        };
      })()`);
      clearTimeout(timer);
      if (process.env.CC_SMOKE_SHOT) { win.showInactive(); await new Promise((r) => setTimeout(r, 1200)); const img = await win.webContents.capturePage(); fs.writeFileSync(process.env.CC_SMOKE_SHOT, img.toPNG()); }
      finish({ ok: r.resultsVisible && r.hasApi && !r.hasNode, ...r, events: smokeLog }, r.resultsVisible ? 0 : 1);
    } catch (e) { clearTimeout(timer); finish({ ok: false, error: String(e) }, 1); }
  });
}
// ---------- 시작 ----------
if (!process.env.CC_SMOKE && !app.requestSingleInstanceLock()) { app.quit(); } else {
  app.on('second-instance', showWindow);
  app.whenReady().then(() => {
    if (process.env.CC_SMOKE) app.setPath('userData', require('node:path').join(require('node:os').tmpdir(), 'cc-smoke-' + process.pid));
    settings = createSettings(app.getPath('userData'));
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));
    service = createService({ getProvider: resolveProvider, emit: (e) => { if (process.env.CC_SMOKE) smokeLog.push(e.type + (e.stage ? ':' + e.stage : '') + (e.message ? ':' + e.message : '')); toRenderer('svc-event', e); } });
    let scriptPath = path.join(__dirname, '..', 'native', 'selection.ps1');
    scriptPath = scriptPath.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
    watcher = createSelectionWatcher({
      scriptPath, onSelection,
      onError: (e) => toRenderer('svc-event', { type: 'notice', message: `자동 감지를 시작하지 못했어요. ${e.message}`, requestId: 0 }),
    });
    registerIpc();
    createWindow();
    if (process.env.CC_SMOKE) { runSmoke(); return; }
    refreshKiroStatus();
    createTray();
    globalShortcut.register(SHORTCUT, analyzeClipboard);
    win.once('ready-to-show', () => win.show());
    if (settings.get().autoAnalyze && settings.get().consentAccepted) watcher.start();
  });
  app.on('before-quit', () => { app.isQuitting = true; });
  app.on('will-quit', () => { globalShortcut.unregisterAll(); if (watcher) watcher.stop(); });
  app.on('window-all-closed', () => { /* 트레이 상주 */ });
}