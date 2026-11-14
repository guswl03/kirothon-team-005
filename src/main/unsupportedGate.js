'use strict';
// 같은 프로그램에는 미지원 안내를 한 번만 보여준다. 키는 프로세스 이름(없으면 PID)이다.
function createUnsupportedGate() {
  const seen = new Set();
  return {
    shouldNotify({ pid, proc }) {
      const key = proc || String(pid);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    },
    reset() { seen.clear(); },
  };
}
module.exports = { createUnsupportedGate };