'use strict';
// 成本演示：本地测试页截图 → 全图 vs ROI 裁剪 的视觉 token 对比；并演示截图缓存跳过重复调用
const fs = require('node:fs');
const path = require('node:path');
const Hands = require('../src/hands');
const eyes = require('../src/eyes');
const imgutil = require('../src/imgutil');
const config = require('../src/config');

async function main() {
  console.log('== 多模态成本优化演示（ROI 裁剪 + 截图缓存）==');
  if (!config.kimi.apiKey) { console.error('需要 .env 里配置 KIMI_API_KEY'); process.exit(1); }
  const url = 'file:///' + path.join(config.dirs.pages, 'demo.html').replace(/\\/g, '/');
  const hands = await Hands.launch(url);
  try {
    const shot = await hands.screenshot();
    const shotFile = path.join(config.dirs.root, 'data', 'cost-demo.png');
    fs.writeFileSync(shotFile, shot);

    // A. 全图观察
    console.log('\n[A] 全图观察（1 次视觉调用）');
    const full = await eyes.observe(shot);
    console.log('  元素数:', full.elements.length, '| 消耗 token:', full.tokens, '| 图片:', Math.round(shot.length / 1024) + 'KB');

    // B. ROI 裁剪：只看登录按钮区域
    const btn = full.elements.find(function (e) { return e.type === 'button' && /登录|Login/i.test(e.text || ''); });
    if (!btn) throw new Error('未识别到登录按钮');
    const crop = imgutil.cropPng(shot, btn.bbox);
    fs.writeFileSync(path.join(config.dirs.root, 'data', 'cost-demo-crop.png'), crop.buffer);
    const cropped = await eyes.observe(crop.buffer, '登录按钮区域');
    console.log('\n[B] ROI 裁剪（只发按钮区域）');
    console.log('  裁剪:', JSON.stringify(crop.rect), '| 消耗 token:', cropped.tokens, '| 图片:', Math.round(crop.buffer.length / 1024) + 'KB');
    if (full.tokens && cropped.tokens) {
      const pct = Math.round((1 - cropped.tokens / full.tokens) * 100);
      console.log('  => ROI 节省 token 约 ' + pct + '%（' + (full.tokens - cropped.tokens) + ' tokens/次）');
    }

    // C. 截图缓存：同一画面第二次不调 API
    console.log('\n[C] 截图缓存（画面未变化时跳过视觉调用）');
    const shot2 = await hands.screenshot();
    const h1 = imgutil.hashPng(shot);
    const h2 = imgutil.hashPng(shot2);
    console.log('  两次截图哈希一致:', h1 === h2, '（一致则第 2 次可直接复用第 1 次结果，省 1 次调用）');
  } finally {
    await hands.close();
  }
  console.log('\n== 演示完成 ==');
  process.exit(0);
}

main().catch(function (e) { console.error('演示失败:', e); process.exit(1); });