'use strict';
// 외부 이미지 파일 없이 PNG 아이콘을 생성한다(트레이/창 아이콘).
const zlib = require('node:zlib');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** 말풍선 느낌의 둥근 아이콘 PNG */
function makeIconPng(size = 32) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const cx = (size - 1) / 2, cy = (size - 1) / 2, rad = size / 2 - 1;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const i = y * (size * 4 + 1) + 1 + x * 4;
      const inCircle = d <= rad;
      // 가운데 말풍선 점 3개
      const dotY = Math.abs(y - cy) < size / 12;
      const dot = dotY && [-size / 4, 0, size / 4].some((o) => Math.abs(x - cx - o) < size / 12);
      if (inCircle) {
        const [r, g, b] = dot ? [255, 255, 255] : [91, 75, 219];
        raw[i] = r; raw[i + 1] = g; raw[i + 2] = b; raw[i + 3] = 255;
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

module.exports = { makeIconPng };