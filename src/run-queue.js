'use strict';
// 队列入口：node src/run-queue.js <queue.json> [--retry=N]  或  --tasks=a,b,c
const fs = require('node:fs');
const path = require('node:path');
const { runQueue } = require('./queue');

function parseArgs(argv) {
  const opts = { file: null, tasks: null, retry: null };
  for (const a of argv) {
    if (a.startsWith('--tasks=')) opts.tasks = a.split('=')[1].split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    else if (a.startsWith('--retry=')) opts.retry = Number(a.split('=')[1]);
    else if (!a.startsWith('--')) opts.file = a;
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let queueSpec = null;
  if (opts.tasks) {
    queueSpec = opts.tasks;
  } else if (opts.file) {
    queueSpec = JSON.parse(fs.readFileSync(opts.file, 'utf8').replace(/^\uFEFF/, ''));
  } else {
    // 默认演示队列：离线快任务 + 真实网页（混合模式）
    queueSpec = [
      { name: 'local-login', mode: 'mock' },
      { name: 'saucedemo-login', mode: 'live', retry: 1 },
    ];
  }
  const summary = await runQueue(queueSpec, { retry: opts.retry });
  process.exit(summary.failed === 0 ? 0 : 1);
}

main().catch(function (e) { console.error(e); process.exit(2); });