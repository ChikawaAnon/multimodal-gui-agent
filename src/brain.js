'use strict';
// 大脑：DeepSeek（OpenAI 兼容）根据眼睛的结构化观察做决策；不可用时用规则兜底
const config = require('./config');

const SYSTEM = '你是一个 GUI 自动化智能体的决策大脑。你只能看到眼睛模块提供的结构化观察（OCR 文本 + 元素坐标），并通过手模块执行动作。你的输出会被程序解析，必须只输出一个 JSON，不要 markdown、不要多余文字。';

function buildUserPrompt(task, observation, history) {
  const lines = [];
  lines.push('任务：' + task);
  lines.push('');
  lines.push('当前观察（结构化）：');
  const compact = { summary: observation.summary, state: observation.state, elements: (observation.elements || []).map(function (e) { return { type: e.type, text: String(e.text || '').slice(0, 50), bbox: e.bbox }; }) };
  lines.push(JSON.stringify(compact));
  lines.push('');
  if (history && history.length) {
    lines.push('此前动作与结果：');
    history.forEach(function (h, i) { lines.push('  step ' + (i + 1) + ': ' + JSON.stringify(h.action) + ' -> ' + h.result); });
    lines.push('');
  }
  lines.push('请决定下一步动作，只输出一个 JSON：');
  lines.push('{"action":"click|type|scroll|wait|inspect|done","target":"元素文本（让手通过DOM定位，可选）","bbox":[x,y,w,h],"text":"type动作要输入的文本","reason":"简短理由","done_reason":"若 action=done 填完成说明"}');
  lines.push('规则：');
  lines.push('- 动作只能是 click / type / scroll / wait / inspect / done');
  lines.push('- 文字太小、图标不清晰、需要精确读取某个区域时，用 inspect（给 target 或 bbox），程序会裁剪该区域放大再看一次；不要对无关区域用 inspect');
  lines.push('- 有可点击元素时优先 click，配合 target 文本；bbox 是后备坐标');
  lines.push('- 输入框用 type，先点中再输入');
  lines.push('- 只有确认任务已经完成才输出 done，并给出 done_reason');
  lines.push('- 如果上一步没效果，不要重复相同动作，换一种方式');
  return lines.join('\n');
}

function extractAction(text) {
  const t = String(text || '').replace(/```(?:json)?/gi, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('brain: 无法解析决策 JSON: ' + t.slice(0, 300));
  return JSON.parse(t.slice(start, end + 1));
}

async function callDecide(task, observation, history, strictHint, maxTokens) {
  const lines = [];
  if (strictHint) lines.push(strictHint);
  lines.push(buildUserPrompt(task, observation, history));
  const body = {
    model: config.deepseek.model,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: lines.join('\n') },
    ],
    max_tokens: maxTokens || 1200,
    thinking: { type: 'disabled' },
  };
  const url = config.deepseek.baseUrl.replace(/\/$/, '') + '/chat/completions';
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.deepseek.apiKey },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error('brain: DeepSeek HTTP ' + resp.status + ': ' + err.slice(0, 300));
  }
  const data = await resp.json();
  const msg = data.choices && data.choices[0] && data.choices[0].message;
  if (!msg) throw new Error('brain: 响应缺少 message');
  const action = extractAction(msg.content);
  if (!action.action) throw new Error('brain: 决策缺少 action 字段: ' + JSON.stringify(action).slice(0, 300));
  return { action: action, reasoning: msg.reasoning_content || '', source: 'deepseek' };
}

async function decide(task, observation, history) {
  try {
    return await callDecide(task, observation, history, '', 2500);
  } catch (e) {
    console.warn('[brain] 首次决策解析失败(' + e.message + ')，重试一次（更大 token + 严格要求）');
    return await callDecide(task, observation, history, '严格要求：你的回复必须是一个完整的 JSON 对象，只包含一个动作。不要输出任何解释、说明、markdown 或 JSON 之外的字符。', 4000);
  }
}
// 规则兜底大脑：DeepSeek 不可用时也能完成常见表单任务
function extractCredentials(task) {
  const m1 = String(task || '').match(/用户名\s*[:：]?\s*([^\s，,、]+)/);
  const m2 = String(task || '').match(/密码\s*[:：]?\s*([^\s，,、]+)/);
  return [m1 ? m1[1] : 'demo', m2 ? m2[1] : '123456'];
}

function isDone(obs) {
  const hay = (obs.summary || '') + '|' + (obs.bodyText || '');
  return /欢迎|welcome|Products|产品|商品/i.test(hay) || obs.state === 'welcome' || obs.state === 'products' || obs.state === 'login_success';
}

function fallbackDecide(obs, history, task) {
  const all = obs.elements || [];
  const inputs = all.filter(function (e) { return e.type === 'input'; });
  const btn = all.find(function (e) { return e.type === 'button' && /登录|登陆|Login|submit|搜索|Search|Sign in/i.test(e.text || ''); });
  if (isDone(obs)) return { action: { action: 'done', done_reason: '页面已出现目标状态', reason: '完成' }, source: 'fallback' };

  const creds = extractCredentials(task);
  // 已经输入过的文本（按历史记录，兼容 live/mock 两种眼睛）
  const typedTexts = (history || []).filter(function (h) { return h.action && h.action.action === 'type'; }).map(function (h) { return String(h.action.text); });
  const userInput = inputs.find(function (e) {
    const hay = (e.placeholder || '') + (e.text || '');
    return /用户|user|name/i.test(hay) && !/密码|pass/i.test(hay);
  });
  const passInput = inputs.find(function (e) { return /密码|pass/i.test((e.placeholder || '') + (e.text || '')); });

  if (userInput && typedTexts.indexOf(creds[0]) === -1) {
    return { action: { action: 'type', target: userInput.text || userInput.placeholder || '', bbox: userInput.bbox, text: creds[0], reason: '规则兜底：输入用户名 ' + creds[0] }, source: 'fallback' };
  }
  if (passInput && typedTexts.indexOf(creds[1]) === -1) {
    return { action: { action: 'type', target: passInput.text || passInput.placeholder || '', bbox: passInput.bbox, text: creds[1], reason: '规则兜底：输入密码 ' + creds[1] }, source: 'fallback' };
  }
  if (btn) return { action: { action: 'click', target: btn.text, bbox: btn.bbox, reason: '规则兜底：点击按钮' }, source: 'fallback' };
  return { action: { action: 'done', done_reason: '无法继续（规则兜底）', reason: '结束' }, source: 'fallback' };
}
module.exports = { decide, fallbackDecide, extractAction };