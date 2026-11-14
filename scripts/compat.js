'use strict';
// 호환성 측정 실행기: npm run compat [-- 지연초]
// 측정 결과를 docs/COMPATIBILITY.md에 붙여 넣을 표 한 줄로 출력한다. 선택 텍스트 내용은 다루지 않는다.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { powershellPath, COPY_APPS } = require('../src/main/selectionWatcher');

const clean = (s, max) => String(s == null ? '' : s).replace(/[|\r\n]/g, ' ').trim().slice(0, max);

const isCopyApp = (name) => COPY_APPS.some((a) => a.toLowerCase() === String(name || '').toLowerCase());

/**
 * 프로브 JSON -> 표 한 줄. 텍스트 필드는 읽지 않는다.
 * 판정 순서는 앱과 같다: 포커스된 컨트롤 -> 커서 아래 요소 -> (메신저면) 복사 옵션 대상.
 */
function formatRow(probe) {
  if (!probe || (probe.ok !== true && probe.pointOk !== true)) return '| (포커스된 컨트롤 없음) | - | 측정 실패 | - | 포커스를 대상 프로그램에 두고 다시 실행 |';
  const proc = clean(probe.pointProc || probe.proc, 40) || '(알 수 없음)';
  const version = clean(probe.version, 24) || '-';
  const cls = clean(probe.cls, 40);
  const pcls = clean(probe.pointCls, 40);
  let status; let note;
  if (probe.password || probe.pointPassword) { status = '제외(비밀번호란)'; note = '내용은 읽지 않음'; }
  else if (probe.pattern && Number(probe.selLen) > 0) { status = '지원'; note = `포커스에서 선택 ${Number(probe.selLen)}자 읽음, class=${cls}`; }
  else if (probe.pointPattern && Number(probe.pointSelLen) > 0) { status = '지원(커서 아래)'; note = `커서 아래 요소(상위 ${Number(probe.pointDepth) || 0}단계)에서 선택 ${Number(probe.pointSelLen)}자 읽음, class=${pcls}`; }
  else if (isCopyApp(proc)) { status = '복사 옵션 필요'; note = `UI Automation으로 선택을 못 읽음, 트레이의 '메신저 드래그 복사'를 켜고 확인, class=${pcls || cls}`; }
  else if (probe.pattern || probe.pointPattern) { status = '지원(선택 없음)'; note = `TextPattern 있음, 선택이 비어 있음, class=${pcls || cls}`; }
  else { status = '미지원'; note = `TextPattern 없음, 대체 경로 사용, class=${pcls || cls}`; }
  return `| ${proc} | ${version} | ${status} | (직접 기록) | ${note} |`;
}

function parseProbeOutput(stdout) {
  const line = String(stdout || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean).pop();
  try { return JSON.parse(line); } catch { return null; }
}

function main() {
  const delay = Number(process.argv[2]);
  const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'compat-probe.ps1')];
  if (Number.isInteger(delay) && delay >= 0) args.push('-DelaySec', String(delay));
  const r = spawnSync(powershellPath(), args, { shell: false, encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'], timeout: 60000 });
  console.log('| 프로그램 | 버전 | 감지 | 지연(초) | 비고 |');
  console.log('|---|---|---|---|---|');
  console.log(formatRow(parseProbeOutput(r.stdout)));
}

if (require.main === module) main();
module.exports = { formatRow, parseProbeOutput };