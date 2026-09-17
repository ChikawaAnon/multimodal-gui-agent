'use strict';
// 队列：顺序执行多个任务（支持按任务覆盖运行模式/重试），产出汇总报告
const fs = require('node:fs');
const path = require('node:path');
const tasks = require('./tasks');
const { run } = require('./agent');
const config = require('./config');
const logger = require('./logger');

function ts() { return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); }

// queueSpec: 数组，每项为任务名(字符串)或完整任务对象 {name/url, task?, verifyText?, maxSteps?, mode?, retry?}
async function runQueue(queueSpec, options) {
  options = options || {};
  const items = (Array.isArray(queueSpec) ? queueSpec : []).map(function (it) { return typeof it === 'string' ? { name: it } : it; });
  if (!items.length) throw new Error('queue: 队列为空');
  logger.init();
  const runId = 'queue-' + ts();
  const results = [];
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  logger.section('队列开始 - 共 ' + items.length + ' 个任务');
  for (let i = 0; i < items.length; i++) {
    const spec = items[i];
    const task = tasks.resolve(spec.name || spec.url || '', spec);
    if (!task.task) task.task = spec.task || config.task || '打开页面并完成任务';
    const retries = spec.retry || options.retry || 0;
    const prevMode = config.mode;
    if (spec.mode) config.mode = spec.mode;
    let res = null;
    let attempt = 0;
    try {
      for (attempt = 0; attempt <= retries; attempt++) {
        logger.section('队列任务 ' + (i + 1) + '/' + items.length + '：' + task.name + '（第 ' + (attempt + 1) + ' 次尝试, mode=' + config.mode + '）');
        res = await run(task);
        if (res.success) break;
        if (attempt < retries) logger.warn('任务失败，自动重试...');
      }
    } finally {
      config.mode = prevMode;
    }
    results.push({
      index: i + 1,
      name: task.name,
      url: task.url,
      mode: spec.mode || config.mode,
      success: !!(res && res.success),
      reason: (res && res.reason) || '未知',
      steps: (res && res.steps) || 0,
      attempts: attempt + 1,
    });
    logger.info('队列进度: ' + (i + 1) + '/' + items.length + ' -> ' + (res && res.success ? '成功' : '失败'));
  }

  const finishedAt = new Date().toISOString();
  const summary = {
    runId: runId,
    startedAt: startedAt,
    finishedAt: finishedAt,
    totalMs: Date.now() - startMs,
    total: results.length,
    passed: results.filter(function (r) { return r.success; }).length,
    failed: results.filter(function (r) { return !r.success; }).length,
    results: results,
  };
  const reportDir = config.dirs.reports;
  fs.mkdirSync(reportDir, { recursive: true });
  const reportFile = path.join(reportDir, runId + '.json');
  fs.writeFileSync(reportFile, JSON.stringify(summary, null, 2));

  logger.section('队列汇总: 通过 ' + summary.passed + '/' + summary.total + '，耗时 ' + Math.round(summary.totalMs / 1000) + 's');
  results.forEach(function (r) { logger.info('  ' + r.index + '. ' + r.name + ' [' + r.mode + '] -> ' + (r.success ? '成功' : '失败') + '（' + r.reason + '）'); });
  logger.info('队列报告: ' + reportFile);
  return summary;
}

module.exports = { runQueue };