'use strict';
// 离线测试：图片哈希与 ROI 裁剪（不联网、不调 API）
const assert = require('node:assert');
const { PNG } = require('pngjs');
const { hashPng, cropPng } = require('../src/imgutil');

function makeImage(w, h, fill) {
  const png = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) << 2;
      const isRect = x >= 20 && x < 120 && y >= 30 && y < 80;
      if (isRect && fill) { png.data[i] = 255; png.data[i + 1] = 0; png.data[i + 2] = 0; png.data[i + 3] = 255; }
      else { png.data[i] = 10; png.data[i + 1] = 20; png.data[i + 2] = 30; png.data[i + 3] = 255; }
    }
  }
  return PNG.sync.write(png);
}

async function main() {
  const buf1 = makeImage(200, 100, true);
  const buf2 = makeImage(200, 100, true); // 内容相同
  const buf3 = makeImage(200, 100, false); // 内容不同

  // 1. 哈希稳定性：相同画面同哈希
  assert.strictEqual(hashPng(buf1), hashPng(buf2), '相同画面哈希应一致');
  // 2. 哈希区分度：不同画面哈希不同
  assert.notStrictEqual(hashPng(buf1), hashPng(buf3), '不同画面哈希应不同');

  // 3. ROI 裁剪：尺寸与内容
  const crop = cropPng(buf1, [20, 30, 100, 50], 0);
  const cropPngObj = PNG.sync.read(crop.buffer);
  assert.strictEqual(cropPngObj.width, 100, '裁剪宽度应为 100');
  assert.strictEqual(cropPngObj.height, 50, '裁剪高度应为 50');
  const c = (0 * 100 + 0) << 2;
  assert.strictEqual(cropPngObj.data[c], 255, '裁剪区域左上角应为红色');

  // 4. 越界裁剪不报错（clamp 到图片内）
  const crop2 = cropPng(buf1, [180, 80, 100, 50], 10);
  assert.ok(crop2.buffer.length > 0, '越界裁剪应返回有效图');

  // 5. 裁剪后 PNG 变小（ROI 节省体积的前提）
  const small = cropPng(buf1, [20, 30, 100, 50], 0);
  assert.ok(small.buffer.length < buf1.length, '裁剪图应小于原图');

  console.log('== 离线成本模块自测通过 ==');
  console.log('  原图:', buf1.length, 'B | 裁剪图:', small.buffer.length, 'B | 缩小约', Math.round((1 - small.buffer.length / buf1.length) * 100) + '%');
  process.exit(0);
}

main().catch(function (e) { console.error('自测失败:', e); process.exit(1); });