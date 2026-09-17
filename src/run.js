'use strict';
// 入口：node src/run.js [任务名或URL] [--steps=N] [--headful] [--mock] [--verify=文本] [--name=名字]
const { run } = require('./agent');
const tasks = require('./tasks');
const config = require('./config');

function parseArgs(argv) {
  const opts = { positional: [], steps: null, headful: false, mock: false, verify: null, name: null };
  for (const a of argv) {
    if (a.startsWith('--steps=')) opts.steps = Number(a.split('=')[1]);
    else if (a.startsWith('--url=')) opts.url = a.split('=')[1];
    else if (a.startsWith('--task=')) opts.positional.push(a.split('=')[1]);
    else if (a.startsWith('--verify=')) opts.verify = a.split('=')[1];
    else if (a.startsWith('--name=')) opts.name = a.split('=')[1];
    else if (a === '--headful') opts.headful = true;
    else if (a === '--mock') opts.mock = true;
    else opts.positional.push(a);
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const target = opts.positional[0] || opts.url || config.task || 'local-login';
  // 解析任务：名字 → 内置；URL → 自定义；默认 local-login
  let task = tasks.resolve(target, {});
  if (!task.task) task.task = config.task || '打开页面，理解内容并完成任务';
  if (!task.verifyText) task.verifyText = config.verifyText || '';
  if (opts.name) task.name = opts.name;
  if (opts.steps) task.maxSteps = opts.steps;
  if (opts.verify) task.verifyText = opts.verify;
  if (opts.headful) config.browser.headless = false;
  if (opts.mock) config.mode = 'mock';
  const res = await run(task);
  process.exit(res.success ? 0 : 1);
}

main().catch(function (e) { console.error(e); process.exit(2); });