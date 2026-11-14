'use strict';
// 결과 창이 화면 밖으로 나가지 않도록 위치를 보정한다.
function placeWindow(cursor, size, workArea, offset = 16) {
  let x = cursor.x + offset;
  let y = cursor.y + offset;
  if (x + size.width > workArea.x + workArea.width) x = cursor.x - size.width - offset;
  if (y + size.height > workArea.y + workArea.height) y = cursor.y - size.height - offset;
  x = Math.min(Math.max(x, workArea.x), workArea.x + workArea.width - size.width);
  y = Math.min(Math.max(y, workArea.y), workArea.y + workArea.height - size.height);
  return { x: Math.round(x), y: Math.round(y) };
}
module.exports = { placeWindow };