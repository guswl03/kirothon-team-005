'use strict';
// 간단한 보안 정적 점검: 위험 패턴이 src/ 에 없는지 확인한다.
const fs = require('node:fs');
const path = require('node:path');

const RULES = [
  [/\.innerHTML\s*=|insertAdjacentHTML|document\.write/, 'HTML 문자열 삽입(XSS 위험)'],
  [/\beval\s*\(|new Function\s*\(/, 'eval/Function 사용'],
  [/shell\s*:\s*true/, 'shell: true 사용(명령 주입 위험)'],
  [/nodeIntegration\s*:\s*true|contextIsolation\s*:\s*false|sandbox\s*:\s*false|webSecurity\s*:\s*false/, '불안전한 BrowserWindow 설정'],
  [/child_process\.exec\(|\bexec\(/, 'exec 사용(spawn 배열 인자 권장)'],
  [/(api[_-]?key|secret|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]/i, '하드코딩된 비밀값 의심'],
  [/console\.(log|info|debug)\(/, '콘솔 로그(선택 텍스트 유출 가능성)'],
];

function walk(dir, out = []) {
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    if (f.isDirectory()) walk(p, out); else if (/\.(js|html|ps1)$/.test(f.name)) out.push(p);
  }
  return out;
}

const root = path.join(__dirname, '..', 'src');
let bad = 0;
for (const file of walk(root)) {
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  lines.forEach((line, i) => {
    if (/^\s*(\/\/|#)/.test(line)) return;
    for (const [re, msg] of RULES) if (re.test(line)) { bad++; console.error(`${path.relative(root, file)}:${i + 1} ${msg}`); }
  });
}
// PowerShell 헬퍼 규칙: 선택 텍스트를 파일/콘솔/오류로 내보내지 않고, 비밀번호란을 제외한다.
const ps = fs.readFileSync(path.join(root, 'native', 'selection.ps1'), 'utf8');
const PS_FORBIDDEN = [
  [/Invoke-Expression|\biex\b/i, 'Invoke-Expression 사용'],
  [/Set-Content|Out-File|Add-Content|\[IO\.File\]|\[System\.IO\.File\]/i, '파일 쓰기(선택 텍스트 저장 금지)'],
  [/Write-Host|Write-Error|Write-Warning|Write-Verbose|Write-Debug|\[Console\]::Error/i, '콘솔/오류 출력(선택 텍스트 유출 가능)'],
  [/Start-Process|Invoke-WebRequest|Invoke-RestMethod|Net\.WebClient/i, '외부 실행/네트워크 호출'],
];
for (const [re, msg] of PS_FORBIDDEN) if (re.test(ps.replace(/^\s*#.*$/gm, ''))) { bad++; console.error(`native/selection.ps1 ${msg}`); }
if (!/IsPasswordProperty/.test(ps)) { bad++; console.error('native/selection.ps1에 비밀번호란 제외(IsPasswordProperty) 필요'); }
// 메신저 복사 대체 경로 규칙: 키 입력과 클립보드 읽기는 정해진 함수 안에서만, 허용 확인 뒤에만 한다.
const psCode = ps.replace(/^\s*#(?! ===== main loop).*$/gm, '');   // 주석은 지우되 함수 영역 끝 표시는 남긴다
if (psCode.indexOf('===== main loop') < 0) { bad++; console.error('native/selection.ps1에 "# ===== main loop =====" 표시 필요(함수 영역 끝)'); }
const loopAt = psCode.indexOf('===== main loop');
const body = (name) => {
  const s = psCode.indexOf(`function ${name}`);
  if (s < 0) return null;
  const rest = psCode.slice(s + 1);
  const ends = [rest.search(/\nfunction /), loopAt >= 0 ? loopAt - s - 1 : -1].filter((n) => n >= 0);
  return { start: s, end: s + 1 + (ends.length ? Math.min(...ends) : rest.length), text: psCode.slice(s, s + 1 + (ends.length ? Math.min(...ends) : rest.length)) };
};
const allIdx = (re) => { const out = []; let m; const g = new RegExp(re.source, 'g'); while ((m = g.exec(psCode))) out.push(m.index); return out; };
const copyFn = body('Invoke-CopyFallback');
const allowFn = body('Test-CopyAllowed');
const backupFn = body('Backup-Clipboard');
const inside = (i, fns) => fns.some((f) => f && i >= f.start && i < f.end);
if (!copyFn || !allowFn) { bad++; console.error('native/selection.ps1에 Invoke-CopyFallback, Test-CopyAllowed 함수 필요'); }
else {
  for (const i of allIdx(/::keybd_event\(|SendInput|SendKeys/)) {
    if (!inside(i, [copyFn])) { bad++; console.error('native/selection.ps1 키 입력은 Invoke-CopyFallback 안에서만 보낸다'); break; }
  }
  const firstKey = copyFn.text.search(/::keybd_event\(/);
  const allowAt = copyFn.text.search(/Test-CopyAllowed/);
  if (firstKey >= 0 && (allowAt < 0 || allowAt > firstKey)) { bad++; console.error('native/selection.ps1 Invoke-CopyFallback는 키 입력 전에 Test-CopyAllowed를 확인해야 한다'); }
  if (!/\$CopyFallback/.test(allowFn.text) || !/\$AllowedCopyApps/.test(allowFn.text)) { bad++; console.error('native/selection.ps1 Test-CopyAllowed는 옵션(-CopyFallback)과 허용 목록을 확인해야 한다'); }
  for (const i of allIdx(/Clipboard\]::GetText|Clipboard\]::GetDataObject/)) {
    if (!inside(i, [copyFn, backupFn])) { bad++; console.error('native/selection.ps1 클립보드 읽기는 Backup-Clipboard, Invoke-CopyFallback 안에서만 한다'); break; }
  }
  if (allIdx(/Invoke-CopyFallback \$/).length !== 1) { bad++; console.error('native/selection.ps1 Invoke-CopyFallback 호출은 드래그 종료 처리 한 곳뿐이어야 한다'); }
}
if (allIdx(/\[Console\]::Out\.WriteLine/).length !== 1) { bad++; console.error('native/selection.ps1 출력은 Emit 한 곳에서만 한다'); }

// 미지원 보고에는 text 필드가 없어야 한다.
if (/type\s*=\s*'unsupported'[^}]*\btext\b/.test(ps)) { bad++; console.error('native/selection.ps1 unsupported 보고에 text 포함 금지'); }
const html = fs.readFileSync(path.join(root, 'renderer', 'index.html'), 'utf8');
if (!/Content-Security-Policy/.test(html) || /unsafe-inline|unsafe-eval/.test(html)) { bad++; console.error('CSP 누락 또는 unsafe 지시어'); }
const main = fs.readFileSync(path.join(root, 'main', 'main.js'), 'utf8');
for (const must of ['contextIsolation: true', 'sandbox: true', 'nodeIntegration: false', 'setPermissionRequestHandler']) {
  if (!main.includes(must)) { bad++; console.error(`main.js에 ${must} 필요`); }
}
console.log(bad ? `보안 점검 실패: ${bad}건` : '보안 정적 점검 통과');
process.exit(bad ? 1 : 0);