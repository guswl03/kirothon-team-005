'use strict';
// Kiro Hook 스크립트 공용 로직. 판단은 순수 함수로 두고 test/hooks/에서 검증한다.
// Hook은 STDIN으로 {hook_event_name, cwd, session_id, tool_name, tool_input} JSON을 받는다.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..', '..');

/** 역할별 소유 디렉터리. docs/TEAM_WORKFLOW.md와 .github/CODEOWNERS를 따른다. */
const ROLES = {
  'feat/desktop': { name: 'A. 데스크톱 통합', owns: ['src/main/', 'src/native/', 'test/desktop/'] },
  'feat/ai': { name: 'B. AI·검색', owns: ['src/ai/', 'test/ai/'] },
  'feat/ui': { name: 'C. UI·문서·발표', owns: ['src/renderer/', 'README.md', 'BUILD_REPORT.md', 'docs/presentation.html', 'PRESENTATION.pdf', 'docs/assets/'] },
};

/** 바꾸기 전에 팀에 알려야 하는 공유 영역. PRD.md는 요청 없이 고치지 않는다. */
const SHARED = [
  { prefix: 'src/core/service.js', why: '이벤트 형식(start, sources, result, error)이 B와 C의 계약입니다. B와 C가 먼저 합의하세요.' },
  { prefix: 'src/core/textGuard.js', why: '입력 검증 규칙은 A, B, C 모두가 씁니다.' },
  { prefix: 'test/core/', why: '공유 코어 테스트입니다.' },
  { prefix: 'src/main/preload.js', why: 'IPC 채널을 바꾸면 main.js(A), preload.js(A), renderer.js(C)를 한 PR로 묶어야 합니다.' },
  { prefix: 'package.json', why: '공유 설정입니다. 작은 커밋으로 바꾸고 바로 알리세요.' },
  { prefix: 'package-lock.json', why: '공유 설정입니다. 작은 커밋으로 바꾸고 바로 알리세요.' },
  { prefix: 'docs/SECURITY_REVIEW.md', why: '보안 검토 문서는 공유 영역입니다.' },
  { prefix: 'PRD.md', why: '원본 PRD는 요청이 있을 때만 수정합니다(AGENTS.md).' },
];

function readStdin() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    return raw.trim() ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/** 저장소 기준 상대 경로(슬래시 구분). 저장소 밖이면 null. */
function toRepoPath(p, cwd = ROOT) {
  if (typeof p !== 'string' || !p.trim()) return null;
  const abs = path.resolve(cwd, p);
  const rel = path.relative(ROOT, abs);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

/** tool_input이나 이벤트 객체에서 파일 경로로 보이는 값을 모은다. */
function extractPaths(obj, depth = 0, out = new Set()) {
  if (!obj || typeof obj !== 'object' || depth > 4) return [...out];
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && /path|file/i.test(k) && v.length < 500) out.add(v);
    else if (Array.isArray(v)) v.forEach((x) => (typeof x === 'string' && /paths|files/i.test(k) ? out.add(x) : extractPaths(x, depth + 1, out)));
    else if (v && typeof v === 'object') extractPaths(v, depth + 1, out);
  }
  return [...out];
}

// ---------- 셸 명령 차단 ----------
const SHELL_RULES = [
  [/\bgit\s+push\b[^\n]*(--force\b|--force-with-lease\b|\s-f\b)/i, 'force push는 다른 사람의 커밋을 지울 수 있어요.'],
  [/\bgit\s+reset\b[^\n]*--hard\b/i, 'git reset --hard는 커밋하지 않은 변경을 지워요.'],
  [/\bgit\s+clean\b[^\n]*\s-[a-z]*f/i, 'git clean -f는 추적하지 않는 파일을 지워요.'],
  [/\bgit\s+branch\b[^\n]*\s-D\b/, 'git branch -D는 합치지 않은 브랜치를 지워요.'],
  [/\bgit\s+checkout\b[^\n]*\s--\s+\./i, 'git checkout -- .는 작업 중인 변경을 지워요.'],
  [/--no-verify\b/i, '훅을 건너뛰는 --no-verify는 쓰지 않아요.'],
  [/\bgit\s+config\b(?![^\n]*(--get|--list|\s-l\b))/i, 'git 설정은 바꾸지 않아요.'],
  [/\bnpm\s+publish\b/i, '패키지 배포는 사람이 직접 해요.'],
];
const SAFE_DELETE_TARGET = /(^|[\s\\/'"])(node_modules|dist|out|tmp|temp)([\s\\/'"]|$)|\$env:TEMP|%TEMP%|os\.tmpdir/i;

/** @returns {{block:boolean, reason?:string}} */
function classifyShell(command) {
  const cmd = String(command || '');
  for (const [re, reason] of SHELL_RULES) if (re.test(cmd)) return { block: true, reason };
  const recursiveForce = /\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r|Remove-Item\b(?=[^\n]*-Recurse)(?=[^\n]*-Force)|\brmdir\s+\/s/i;
  if (recursiveForce.test(cmd) && !SAFE_DELETE_TARGET.test(cmd)) {
    return { block: true, reason: '재귀 강제 삭제는 node_modules, dist, out, 임시 폴더에만 허용해요.' };
  }
  return { block: false };
}

// ---------- 비밀값 차단 ----------
const SECRET_RULES = [
  [/\bsk-(proj-)?[A-Za-z0-9_-]{20,}/, 'OpenAI API 키'],
  [/\bksk_[A-Za-z0-9_-]{16,}/, 'Kiro API 키'],
  [/\bAKIA[0-9A-Z]{16}\b/, 'AWS 액세스 키'],
  [/\bgh[pousr]_[A-Za-z0-9]{30,}/, 'GitHub 토큰'],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, '개인 키'],
];

/** 쓰기 내용에서 비밀값으로 보이는 종류 목록(값 자체는 돌려주지 않는다). */
function findSecrets(text) {
  const s = String(text || '');
  return SECRET_RULES.filter(([re]) => re.test(s)).map(([, name]) => name);
}

function writtenText(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return '';
  return ['text', 'newStr', 'content', 'new_str', 'contents', 'file_text']
    .map((k) => (typeof toolInput[k] === 'string' ? toolInput[k] : '')).join('\n');
}

// ---------- 공유 영역·소유권 ----------
function currentBranch() {
  const r = spawnSync('git', ['branch', '--show-current'], { cwd: ROOT, encoding: 'utf8', windowsHide: true });
  return r.status === 0 ? r.stdout.trim() : '';
}

/**
 * 쓰기 대상 경로가 공유 영역이거나 다른 역할의 소유면 확인을 요청한다.
 * @returns {null | {reason:string}}
 */
function ownershipDecision(repoPaths, branch) {
  const notes = [];
  for (const p of repoPaths) {
    const shared = SHARED.find((s) => p === s.prefix || p.startsWith(s.prefix));
    if (shared) { notes.push(`${p}: ${shared.why}`); continue; }
    const role = ROLES[branch];
    if (!role) continue;
    const owner = Object.entries(ROLES).find(([, r]) => r.owns.some((o) => p === o || p.startsWith(o)));
    if (owner && owner[0] !== branch) notes.push(`${p}: ${owner[1].name} 담당 파일입니다. 지금 브랜치(${branch})는 ${role.name}입니다.`);
  }
  return notes.length ? { reason: notes.join(' / ') } : null;
}

// ---------- 저장 시 관련 테스트 ----------
/** 저장된 파일에 맞는 테스트 glob 목록. */
function testTargets(repoPath) {
  if (!repoPath || !/\.(js|ps1|html)$/.test(repoPath)) return [];
  const map = [
    [/^(src\/ai|test\/ai)\//, ['test/ai/*.test.js', 'test/core/*.test.js']],
    [/^(src\/core|test\/core)\//, ['test/core/*.test.js']],
    [/^(src\/main|src\/native|test\/desktop)\//, ['test/desktop/*.test.js']],
    [/^(scripts\/hooks|test\/hooks)\//, ['test/hooks/*.test.js']],
    [/^(scripts\/mcp|test\/mcp)\//, ['test/mcp/*.test.js']],
  ];
  const hit = map.find(([re]) => re.test(repoPath));
  return hit ? hit[1] : [];
}

/** node --test를 실행하고 요약 줄과 실패 내용을 돌려준다. */
function runNodeTests(globs) {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...globs], { cwd: ROOT, encoding: 'utf8', windowsHide: true, timeout: 120000 });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const num = (k) => { const m = out.match(new RegExp(`^# ${k} (\\d+)`, 'm')); return m ? Number(m[1]) : 0; };
  const failures = out.split(/\r?\n/).filter((l) => /^\s*not ok\b/.test(l)).slice(0, 10);
  return { ok: r.status === 0, tests: num('tests'), pass: num('pass'), fail: num('fail'), failures };
}

function runCheck() {
  const r = spawnSync(process.execPath, ['scripts/check.js'], { cwd: ROOT, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  return { ok: r.status === 0, output: `${r.stdout || ''}${r.stderr || ''}`.trim() };
}

/** 진행 중인 spec 작업([ ]로 남은 항목) 목록. */
function pendingSpecTasks() {
  const dir = path.join(ROOT, '.kiro', 'specs');
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const spec of fs.readdirSync(dir)) {
    const f = path.join(dir, spec, 'tasks.md');
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*- \[ \]\*?\s*(.+)$/);
      if (m) out.push(`${spec}: ${m[1].trim()}`);
    }
  }
  return out;
}

module.exports = {
  ROOT, ROLES, SHARED, readStdin, toRepoPath, extractPaths, classifyShell, findSecrets, writtenText,
  currentBranch, ownershipDecision, testTargets, runNodeTests, runCheck, pendingSpecTasks,
};
