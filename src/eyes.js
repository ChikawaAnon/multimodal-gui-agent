'use strict';
// 眼睛：把截图交给现成多模态 API（Kimi/Moonshot），返回结构化 JSON（OCR + 元素坐标 + 状态）
const config = require('./config');

const SYSTEM = '你是界面视觉感知模块。你的输出会被程序解析，必须严格遵守 JSON 格式，不要输出 markdown 代码块、不要任何解释。';

function buildUserPrompt(focus) {
  const lines = [];
  lines.push('请分析这张界面截图，输出严格 JSON，字段如下：');
  lines.push('1. summary: 一句话描述当前页面状态（中文）');
  lines.push('2. state: 页面状态标签，取值建议 login_form / welcome / loading / error / unknown 之一');
  lines.push('3. elements: 界面中的可交互元素和关键文本数组，每项 {type, text, bbox:[x,y,w,h]}；type ∈ button/input/link/text/heading/icon；bbox 是元素在截图中的像素坐标 [左, 上, 宽, 高]，尽量准确');
  lines.push('4. only_output_json: true');
  lines.push('JSON 结构：{"summary":"...","state":"...","elements":[{"type":"...","text":"...","bbox":[x,y,w,h]}]}');
  if (focus) lines.push('重点关注：' + focus);
  return lines.join('\n');
}

function extractJson(text) {
  if (!text) throw new Error('eyes: 模型未返回内容');
  const t = text.replace(/```(?:json)?/gi, '').trim();
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) throw new Error('eyes: 无法从模型输出中解析 JSON: ' + text.slice(0, 300));
  return JSON.parse(t.slice(start, end + 1));
}

async function callVision(screenshotBuffer, focus, retryHint) {
  const b64 = screenshotBuffer.toString('base64');
  const promptLines = [buildUserPrompt(focus)];
  if (retryHint) promptLines.push(retryHint);
  const body = {
    model: config.kimi.model,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: [
        { type: 'text', text: promptLines.join('\n') },
        { type: 'image_url', image_url: { url: 'data:image/png;base64,' + b64 } },
      ]},
    ],
    max_tokens: 3000,
    thinking: { type: 'disabled' },
  };
  const resp = await fetch(config.kimi.baseUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + config.kimi.apiKey },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error('eyes: 视觉 API HTTP ' + resp.status + ': ' + err.slice(0, 300));
  }
  const data = await resp.json();
  const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
  return { parsed: extractJson(content), data: data };
}

async function observe(screenshotBuffer, focus) {
  if (!config.kimi.apiKey) throw new Error('eyes: 缺少 KIMI_API_KEY');
  let parsed = null;
  let data = null;
  try {
    const r1 = await callVision(screenshotBuffer, focus, '');
    parsed = r1.parsed; data = r1.data;
  } catch (e) {
    console.warn('[eyes] 首次解析失败(' + e.message + ')，重试一次');
    const r2 = await callVision(screenshotBuffer, focus, '注意：上次输出 JSON 不完整。请只输出一个完整、不截断的 JSON 对象，不要省略任何字段。');
    parsed = r2.parsed; data = r2.data;
  }
  if (!Array.isArray(parsed.elements)) parsed.elements = [];
  // 若视觉模型返回归一化坐标(0~1)，按视口换算成像素
  const W = config.browser.viewport.width;
  const H = config.browser.viewport.height;
  parsed.elements = parsed.elements.map(function (e) {
    const b = e.bbox;
    if (b && b.length === 4 && b.every(function (v) { return v >= 0 && v <= 1; })) {
      e.bbox = [Math.round(b[0] * W), Math.round(b[1] * H), Math.round(b[2] * W), Math.round(b[3] * H)];
    }
    return e;
  });
  return {
    summary: parsed.summary || '',
    state: parsed.state || 'unknown',
    elements: parsed.elements,
    tokens: (data && data.usage && data.usage.total_tokens) || null,
  };
}
module.exports = { observe, extractJson };