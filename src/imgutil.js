'use strict';
// 图片工具：像素哈希（截图缓存用）+ 区域裁剪（ROI 用），基于 pngjs（纯 JS，无原生依赖）
const { PNG } = require('pngjs');

// 解码 PNG 为像素对象
function decode(buffer) { return PNG.sync.read(buffer); }

// 感知哈希：降采样到 gw x gh 网格后量化成十六进制串；相同画面得到相同哈希，画面变化哈希即变
function hashPng(buffer, gw, gh) {
  gw = gw || 24; gh = gh || 12;
  const png = decode(buffer);
  const { width, height, data } = png;
  const cells = [];
  for (let gy = 0; gy < gh; gy++) {
    const y0 = Math.floor(gy * height / gh), y1 = Math.max(y0 + 1, Math.floor((gy + 1) * height / gh));
    for (let gx = 0; gx < gw; gx++) {
      const x0 = Math.floor(gx * width / gw), x1 = Math.max(x0 + 1, Math.floor((gx + 1) * width / gw));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const i = (y * width + x) << 2;
          r += data[i]; g += data[i + 1]; b += data[i + 2]; a += data[i + 3]; n++;
        }
      }
      cells.push(Math.round(r / n / 16).toString(16), Math.round(g / n / 16).toString(16), Math.round(b / n / 16).toString(16), Math.round(a / n / 16).toString(16));
    }
  }
  return cells.join('');
}

// ROI 裁剪：按 bbox [x,y,w,h] 加 margin 裁出子图，返回新的 PNG buffer
function cropPng(buffer, bbox, margin) {
  if (!Array.isArray(bbox) || bbox.length !== 4) throw new Error('crop: bbox 格式错误 ' + JSON.stringify(bbox));
  margin = (typeof margin === 'number' && margin >= 0) ? margin : 12;
  const png = decode(buffer);
  const x = Math.max(0, Math.floor(bbox[0] - margin));
  const y = Math.max(0, Math.floor(bbox[1] - margin));
  const w = Math.min(png.width - x, Math.max(1, Math.ceil(bbox[2] + margin * 2)));
  const h = Math.min(png.height - y, Math.max(1, Math.ceil(bbox[3] + margin * 2)));
  if (w <= 0 || h <= 0) throw new Error('crop: 裁剪区域无效 bbox=' + JSON.stringify(bbox));
  const out = new PNG({ width: w, height: h });
  for (let yy = 0; yy < h; yy++) {
    for (let xx = 0; xx < w; xx++) {
      const si = ((y + yy) * png.width + (x + xx)) << 2;
      const di = (yy * w + xx) << 2;
      out.data[di] = png.data[si]; out.data[di + 1] = png.data[si + 1];
      out.data[di + 2] = png.data[si + 2]; out.data[di + 3] = png.data[si + 3];
    }
  }
  return { buffer: PNG.sync.write(out), rect: { x: x, y: y, w: w, h: h } };
}

module.exports = { decode, hashPng, cropPng };