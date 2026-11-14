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
const html = fs.readFileSync(path.join(root, 'renderer', 'index.html'), 'utf8');
if (!/Content-Security-Policy/.test(html) || /unsafe-inline|unsafe-eval/.test(html)) { bad++; console.error('CSP 누락 또는 unsafe 지시어'); }
const main = fs.readFileSync(path.join(root, 'main', 'main.js'), 'utf8');
for (const must of ['contextIsolation: true', 'sandbox: true', 'nodeIntegration: false', 'setPermissionRequestHandler']) {
  if (!main.includes(must)) { bad++; console.error(`main.js에 ${must} 필요`); }
}
console.log(bad ? `보안 점검 실패: ${bad}건` : '보안 정적 점검 통과');
process.exit(bad ? 1 : 0);