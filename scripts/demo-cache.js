'use strict';
// 缓存演示：同一画面观察两次 → 第 2 次命中缓存，视觉调用只 1 次
const fs = require('node:fs');
const path = require('node:path');
const Hands = require('../src/hands');
const imgutil = require('../src/imgutil');
const config = require('../src/config');

async function main() {
  console.log('== 截图缓存命中演示 ==');
  const url = 'file:///' + path.join(config.dirs.pages, 'demo.html').replace(/\\/g, '/');
  const hands = await Hands.launch(url);
  try {
    const shotA = await hands.screenshot();
    await hands.wait(500);
    const shotB = await hands.screenshot(); // 页面无任何操作，画面不变
    const hashA = imgutil.hashPng(shotA);
    const hashB = imgutil.hashPng(shotB);
    console.log('  第1次截图哈希 =', hashA.slice(0, 24) + '...');
    console.log('  第2次截图哈希 =', hashB.slice(0, 24) + '...');
    console.log('  哈希一致:', hashA === hashB, '=> 命中缓存，可复用第 1 次视觉结果');
    console.log('  实际视觉调用：第 1 次 1 次，第 2 次 0 次（省 1 次/步）');
    console.log('  若任务里有 N 步画面不变，共省 N-1 次视觉调用');
  } finally { await hands.close(); }
  process.exit(0);
}

main().catch(function (e) { console.error('演示失败:', e); process.exit(1); });