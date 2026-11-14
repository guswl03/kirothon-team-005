'use strict';
// 결과 창이 화면 밖으로 나가지 않도록 위치를 보정한다.
// 창이 작업 영역보다 크면 작업 영역 크기로 줄여서 계산한다.
function placeWindow(cursor, size, workArea, offset = 16) {
  const width = Math.min(size.width, workArea.width);
  const height = Math.min(size.height, workArea.height);
  let x = cursor.x + offset;
  let y = cursor.y + offset;
  if (x + width > workArea.x + workArea.width) x = cursor.x - width - offset;
  if (y + height > workArea.y + workArea.height) y = cursor.y - height - offset;
  x = Math.min(Math.max(x, workArea.x), workArea.x + workArea.width - width);
  y = Math.min(Math.max(y, workArea.y), workArea.y + workArea.height - height);
  return { x: Math.round(x), y: Math.round(y) };
}
module.exports = { placeWindow };