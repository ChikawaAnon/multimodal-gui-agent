'use strict';
// 离线自测：mock 模式（DOM 眼睛 + 规则大脑）跑本地登录页，不调用任何外部 API
process.env.RUN_MODE = 'mock';
const assert = require('node:assert');
const { run } = require('../src/agent');
const tasks = require('../src/tasks');

async function main() {
  console.log('== 离线自测：local-login（mock 模式）==');
  const task = tasks.resolve('local-login', {});
  const res = await run(task);
  assert.strictEqual(res.success, true, '本地登录任务应成功: ' + res.reason);
  console.log('== 自测通过 ==');
  process.exit(0);
}

main().catch(function (e) { console.error('自测失败:', e); process.exit(1); });