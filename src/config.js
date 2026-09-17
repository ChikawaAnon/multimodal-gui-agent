'use strict';
// 配置读取：.env + 环境变量 + CLI 覆盖
const fs = require('node:fs');
const path = require('node:path');

function loadDotEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !m[2].startsWith('#')) out[m[1]] = m[2];
  }
  return out;
}

const env = { ...loadDotEnv(), ...process.env };

function num(v, d) { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; }

const config = {
  kimi: {
    apiKey: env.KIMI_API_KEY || '',
    model: env.KIMI_VISION_MODEL || 'kimi-k2.6',
    baseUrl: 'https://api.moonshot.cn/v1/chat/completions',
  },
  deepseek: {
    baseUrl: env.DEEPSEEK_BASE_URL || 'http://127.0.0.1:15721/v1',
    apiKey: env.DEEPSEEK_API_KEY || 'PROXY_MANAGED',
    model: env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
  },
  browser: {
    edgePath: env.EDGE_PATH || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: (env.HEADLESS || 'true') !== 'false',
    viewport: { width: num(env.VIEWPORT_WIDTH, 1280), height: num(env.VIEWPORT_HEIGHT, 800) },
    timeout: num(env.PAGE_TIMEOUT, 30000),
  },
  // 界面类型：web=浏览器(Playwright)；desktop=原生桌面(UIAutomation)
  mode: (env.RUN_MODE || 'live').toLowerCase(),
  task: env.TASK || '',
  url: env.TASK_URL || '',
  maxSteps: num(env.MAX_STEPS, 10),
  maxInspects: num(env.MAX_INSPECTS, 3),
  verifyText: env.VERIFY_TEXT || '',
  dirs: {
    root: path.join(__dirname, '..'),
    screenshots: path.join(__dirname, '..', 'output', 'screenshots'),
    reports: path.join(__dirname, '..', 'output', 'reports'),
    logs: path.join(__dirname, '..', 'data', 'logs'),
    pages: path.join(__dirname, '..', 'pages'),
  },
};

if (config.mode === 'live' && !config.kimi.apiKey) {
  console.warn('[config] 警告：live 模式需要 KIMI_API_KEY；可用 RUN_MODE=mock 离线自测。');
}

module.exports = config;