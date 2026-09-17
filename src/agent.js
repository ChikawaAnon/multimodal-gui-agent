'use strict';
// 主循环：感知(眼睛,含截图缓存) -> 决策(大脑,支持ROI放大) -> 执行(手) -> 验证
const fs = require('node:fs');
const path = require('node:path');
const Hands = require('./hands');
const DesktopHands = require('./hands-desktop');
const eyes = require('./eyes');
const mock = require('./mock');
const brain = require('./brain');
const imgutil = require('./imgutil');
const config = require('./config');
const logger = require('./logger');

function bboxCenter(b) { return b ? [b[0] + b[2] / 2, b[1] + b[3] / 2] : null; }

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

async function run(task) {
  logger.init();
  const surface = task.surface || config.surface;
  const runId = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '-' + String(task.name || 'custom').replace(/[^A-Za-z0-9_-]/g, '-');
  const shotDir = path.join(config.dirs.screenshots, runId);
  fs.mkdirSync(shotDir, { recursive: true });
  fs.mkdirSync(config.dirs.reports, { recursive: true });

  logger.section('多模态 Agent 运行 - 任务: ' + task.name + ' (' + task.desc + ')');
  logger.info('任务内容: ' + task.task);
  logger.info('界面: ' + surface + (surface === 'desktop' ? ' (应用: ' + (task.app || '当前桌面') + ')' : ' (URL: ' + task.url + ')'));
  logger.info('运行模式: ' + config.mode + ' (live=视觉API+DeepSeek, mock=DOM/UI+规则)');
  logger.info('成本优化: 截图缓存=' + (config.mode === 'live' ? '开' : 'n/a') + ' | ROI放大上限=' + config.maxInspects);
  logger.info('大脑: ' + config.deepseek.model + ' @ ' + config.deepseek.baseUrl);
  logger.info('眼睛: ' + (config.mode === 'mock' ? (surface === 'desktop' ? 'UIAutomation直读' : 'DOM直读') : config.kimi.model));

  const history = [];
  const stats = { visionCalls: 0, cacheHits: 0, inspects: 0, cropBytesSaved: 0 };
  let noopCount = 0;
  let lastSig = '';
  let finalPageState = null;
  let windowRect = null;
  let lastHash = null;
  let lastObs = null;
  let lastShot = null;
  let result = { success: false, reason: '达到步数上限未完成', steps: 0 };

  const hands = surface === 'desktop' ? await DesktopHands.launch(task) : await Hands.launch(task.url);

  try {
    for (let step = 1; step <= (task.maxSteps || config.maxSteps); step++) {
      logger.section('第 ' + step + ' 步');

      // 1. 感知（live：截图 + 像素哈希缓存；mock：DOM/UI 直读）
      let obs = null;
      try {
        if (config.mode === 'mock') {
          obs = surface === 'desktop' ? await mock.perceiveDesktop(hands) : await mock.perceiveDom(hands);
        } else {
          let shot = null;
          if (surface === 'desktop') {
            const ws = await hands.windowShot(task.title || task.app);
            windowRect = ws.rect;
            shot = ws.buffer;
          } else {
            shot = await hands.screenshot();
          }
          lastShot = shot;
          const shotFile = path.join(shotDir, 'step' + String(step).padStart(2, '0') + '.png');
          fs.writeFileSync(shotFile, shot);
          // 截图缓存：画面未变化则复用上次观察，省一次视觉调用
          const hash = imgutil.hashPng(shot);
          if (lastHash === hash && lastObs) {
            stats.cacheHits++;
            obs = lastObs;
            logger.info('[眼睛][缓存] 画面未变化，复用上次观察（省 1 次视觉调用）');
          } else {
            stats.visionCalls++;
            obs = await eyes.observe(shot);
            lastHash = hash;
            lastObs = obs;
          }
        }
      } catch (e) {
        logger.error('[眼睛] 感知失败: ' + e.message);
        result = { success: false, reason: '眼睛调用失败: ' + e.message, steps: step };
        break;
      }
      const sig = JSON.stringify(obs.elements) + '|' + obs.state;
      logger.info('[眼睛] state=' + obs.state + (obs.detail ? ' (含ROI细节)' : ''));
      logger.info('[眼睛] summary=' + obs.summary);
      logger.info('[眼睛] elements=' + obs.elements.length + ' -> ' + obs.elements.map(function (e) { return e.type + ':' + (e.text || ''); }).join(', ').slice(0, 400));

      // 2. 决策
      let decision = null;
      try {
        if (config.mode === 'mock') throw new Error('mock 模式不使用 DeepSeek');
        decision = await brain.decide(task.task, obs, history);
      } catch (e) {
        if (config.mode !== 'mock') logger.warn('[大脑] DeepSeek 决策失败(' + e.message + ')，使用规则兜底');
        decision = brain.fallbackDecide(obs, history, task.task);
      }
      logger.info('[大脑] (' + decision.source + ') action=' + JSON.stringify(decision.action));
      let action = decision.action;

      // 2.5 ROI 放大：inspect 动作 → 裁剪该区域重看，用增强观察重新决策（有次数上限）
      if (action.action === 'inspect') {
        stats.inspects++;
        if (stats.inspects > config.maxInspects || config.mode === 'mock') {
          logger.warn('[ROI] inspect 次数超限或 mock 模式，跳过放大');
          action = { action: 'wait', ms: 300, reason: 'inspect 超限' };
        } else {
          const bbox = resolveBbox(action, obs);
          if (!bbox || !lastShot) {
            logger.warn('[ROI] 无法定位放大区域（无 bbox/target 或无可截图），改为等待');
            action = { action: 'wait', ms: 300, reason: 'inspect 无目标' };
          } else {
            try {
              const cropped = imgutil.cropPng(lastShot, bbox);
              stats.cropBytesSaved += Math.max(0, lastShot.length - cropped.buffer.length);
              const cropFile = path.join(shotDir, 'step' + String(step).padStart(2, '0') + '-inspect.png');
              fs.writeFileSync(cropFile, cropped.buffer);
              logger.info('[ROI] 裁剪 ' + JSON.stringify(cropped.rect) + '：原图 ' + Math.round(lastShot.length / 1024) + 'KB -> ' + Math.round(cropped.buffer.length / 1024) + 'KB');
              stats.visionCalls++;
              const detail = await eyes.observe(cropped.buffer, action.target || '聚焦区域');
              obs.detail = detail;
              history.push({ action: { action: 'inspect', target: action.target, bbox: bbox }, result: 'inspect: ' + detail.summary });
              logger.info('[ROI] 细节: ' + detail.summary);
              // 用增强后的观察重新决策
              try {
                decision = await brain.decide(task.task, obs, history);
              } catch (e2) {
                decision = brain.fallbackDecide(obs, history, task.task);
              }
              action = decision.action;
              logger.info('[大脑][再决策] (' + decision.source + ') action=' + JSON.stringify(action));
            } catch (e) {
              logger.warn('[ROI] 放大失败(' + e.message + ')，改为等待');
              action = { action: 'wait', ms: 300, reason: 'inspect 失败' };
            }
          }
        }
      }

      // 3. 动作白名单过滤
      if (Array.isArray(task.allowActions) && task.allowActions.indexOf(action.action) === -1) {
        logger.warn('[安全] 动作 ' + action.action + ' 不在本任务白名单(' + task.allowActions.join('/') + ')，跳过');
        history.push({ action: action, result: 'skipped: not allowed' });
        continue;
      }

      // 4. 执行
      let execResult = '';
      try {
        if (action.action === 'done') {
          logger.info('[手] 判定完成: ' + (action.done_reason || ''));
          result = { success: true, reason: action.done_reason || '任务完成', steps: step };
          break;
        } else if (action.action === 'click') {
          if (surface === 'desktop') {
            const c = bboxCenter(action.bbox);
            const sx = windowRect ? c[0] + windowRect.x : c[0];
            const sy = windowRect ? c[1] + windowRect.y : c[1];
            execResult = await hands.click(sx, sy);
          } else {
            execResult = await hands.clickByTarget(action.target, action.bbox);
          }
        } else if (action.action === 'type') {
          if (surface === 'desktop') {
            execResult = await hands.type(action.text || '');
          } else {
            await hands.typeIntoInput(action.text || '', action.target);
            execResult = 'type:' + (action.text || '');
          }
        } else if (action.action === 'scroll') {
          if (surface === 'desktop') { await hands.wait(300); execResult = 'scroll(桌面忽略)'; }
          else { await hands.scroll(action.dx || 0, action.dy || 300); execResult = 'scroll'; }
        } else if (action.action === 'wait') {
          await hands.wait(action.ms || 500);
          execResult = 'wait ' + (action.ms || 500) + 'ms';
        } else {
          throw new Error('未知动作: ' + action.action);
        }
        logger.info('[手] ' + execResult);
      } catch (e) {
        logger.error('[手] 执行失败: ' + e.message);
        execResult = 'error: ' + e.message;
      }

      // 5. 记录 + 无进展检测
      history.push({ action: action, result: execResult });
      if (sig === lastSig) noopCount++; else noopCount = 0;
      lastSig = sig;
      if (noopCount >= 3) {
        logger.warn('[主循环] 连续 3 步页面无变化，提前结束');
        result = { success: false, reason: '连续 3 步无进展', steps: step };
        break;
      }
    }
  } finally {
    try { finalPageState = surface === 'desktop' ? await hands.pageState(task.title || task.app) : await hands.pageState(); } catch (e) {}
    await hands.close();
  }

  // 6. 最终校验
  if (result.success && task.verifyText) {
    const hay = ((finalPageState && finalPageState.bodyText) || '') + '|' + ((finalPageState && finalPageState.title) || '');
    const hit = hay.indexOf(task.verifyText) !== -1;
    if (!hit) {
      logger.warn('[验证] 大脑判定完成，但最终页面未找到预期文本「' + task.verifyText + '」，改为失败');
      result = { success: false, reason: '页面未出现预期文本「' + task.verifyText + '」', steps: history.length };
    } else {
      logger.info('[验证] 最终页面已出现预期文本「' + task.verifyText + '」，验证通过');
    }
  }

  // 7. 报告
  const report = {
    runId: runId,
    task: task,
    surface: surface,
    mode: config.mode,
    startedAt: new Date().toISOString(),
    result: result,
    stats: stats,
    finalPageState: finalPageState,
    history: history,
  };
  const reportFile = path.join(config.dirs.reports, runId + '.json');
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

  logger.section('结果: ' + (result.success ? '成功' : '失败'));
  logger.info('原因: ' + result.reason);
  logger.info('步骤数: ' + (result.steps || history.length));
  logger.info('[成本] 视觉API调用=' + stats.visionCalls + ' 缓存命中=' + stats.cacheHits + ' ROI放大=' + stats.inspects + ' 裁剪节省约=' + Math.round(stats.cropBytesSaved / 1024) + 'KB');
  logger.info('截图目录: ' + shotDir);
  logger.info('报告: ' + reportFile);
  return result;
}

module.exports = { run };