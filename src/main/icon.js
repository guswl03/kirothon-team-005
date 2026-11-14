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

// ---- 아는척 아이콘: Kiro 보라 둥근 사각형 + 곁눈질하는 눈 두 개 ----
// 원본 디자인은 src/renderer/icon.svg(256x256)다. 창·트레이 아이콘은 PNG가 필요해서 같은 도형을
// 0~1 좌표로 옮겨 그린다. SVG를 바꾸면 아래 숫자도 같이 바꾼다(값 = SVG 좌표 / 256).
// 픽셀마다 4x4 표본을 찍어 가장자리를 부드럽게(안티앨리어싱) 만든다.
const TOP = [176, 128, 255];   // #b080ff
const BOTTOM = [113, 56, 204]; // #7138cc
const PUPIL = [42, 22, 82];    // #2a1652
const CORNER = 58 / 256;
const WHITES = [[94, 128], [162, 128]].map(([x, y]) => [x / 256, y / 256, 30 / 256, 44 / 256]);
const PUPILS = [[104, 118], [172, 118]].map(([x, y]) => [x / 256, y / 256, 13 / 256, 19 / 256]);

/** 모서리가 둥근 사각형 안쪽인지 */
function inRoundRect(x, y, r) {
  const qx = Math.max(Math.abs(x - 0.5) - (0.5 - r), 0);
  const qy = Math.max(Math.abs(y - 0.5) - (0.5 - r), 0);
  return qx * qx + qy * qy <= r * r;
}

const inAny = (list, x, y) => list.some(([cx, cy, rx, ry]) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1);

function sample(x, y) {
  if (!inRoundRect(x, y, CORNER)) return null;
  if (inAny(PUPILS, x, y)) return PUPIL;
  if (inAny(WHITES, x, y)) return [255, 255, 255];
  const t = Math.min(1, Math.max(0, (x + y) / 2));  // 왼쪽 위 -> 오른쪽 아래
  return TOP.map((c, i) => c + (BOTTOM[i] - c) * t);
}

/** Kiro 느낌의 눈 아이콘 PNG (투명 배경) */
function makeIconPng(size = 32) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  const n = 4;                       // 픽셀당 n x n 표본
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, hit = 0;
      for (let sy = 0; sy < n; sy++) {
        for (let sx = 0; sx < n; sx++) {
          const c = sample((x + (sx + 0.5) / n) / size, (y + (sy + 0.5) / n) / size);
          if (c) { r += c[0]; g += c[1]; b += c[2]; hit++; }
        }
      }
      const i = y * (size * 4 + 1) + 1 + x * 4;
      if (hit) {
        raw[i] = Math.round(r / hit); raw[i + 1] = Math.round(g / hit); raw[i + 2] = Math.round(b / hit);
        raw[i + 3] = Math.round((255 * hit) / (n * n));
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