'use strict';
// ROI-inspect 全链路演示：全图观察 → 裁剪按钮区域放大 → 用增强观察让大脑重新决策
const fs = require('node:fs');
const path = require('node:path');
const Hands = require('../src/hands');
const eyes = require('../src/eyes');
const brain = require('../src/brain');
const imgutil = require('../src/imgutil');
const config = require('../src/config');

function resolveBbox(action, obs) {
  if (Array.isArray(action.bbox) && action.bbox.length === 4) return action.bbox;
  if (action.target) {
    const hit = (obs.elements || []).find(function (e) {
      const t = String(e.text || '');
      return t.indexOf(String(action.target)) !== -1 || String(action.target).indexOf(t) !== -1;
    });
    if (hit && hit.bbox) return hit.bbox;
  }
  return null;
}

async function main() {
  console.log('== ROI-inspect 全链路演示（裁剪放大 → 大脑重新决策）==');
  const url = 'file:///' + path.join(config.dirs.pages, 'demo.html').replace(/\\/g, '/');
  const hands = await Hands.launch(url);
  try {
    const shot = await hands.screenshot();
    const full = await eyes.observe(shot);
    console.log('\n[1] 全图观察: 元素', full.elements.length, '个 | token', full.tokens);

    // 模拟大脑发出 inspect（目标：登录按钮）
    const btn = full.elements.find(function (e) { return e.type === 'button' && /登录|Login/i.test(e.text || ''); });
    const fakeAction = { action: 'inspect', target: btn ? btn.text : '登录', bbox: btn ? btn.bbox : null };
    const bbox = resolveBbox(fakeAction, full);
    console.log('\n[2] 大脑发出 inspect，目标 bbox:', JSON.stringify(bbox));

    const crop = imgutil.cropPng(shot, bbox);
    const detail = await eyes.observe(crop.buffer, fakeAction.target);
    console.log('    裁剪图 token:', detail.tokens, '| 全图 token:', full.tokens, '| 节省约', full.tokens && detail.tokens ? Math.round((1 - detail.tokens / full.tokens) * 100) + '%' : '?');

    // 增强观察：把细节合并进 obs，让大脑重新决策
    const enriched = Object.assign({}, full, { detail: detail });
    const decision = await brain.decide('在页面上找到登录按钮并点击', enriched, [{ action: fakeAction, result: 'inspect 完成' }]);
    console.log('\n[3] 大脑基于增强观察重新决策: action=', JSON.stringify(decision.action));
    console.log('    （说明 inspect 后能正常衔接后续动作）');
  } finally { await hands.close(); }
  process.exit(0);
}

main().catch(function (e) { console.error('演示失败:', e); process.exit(1); });