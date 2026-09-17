'use strict';
// 内置任务注册表：每个任务 = {name, url, task, verifyText, maxSteps}
const path = require('node:path');
const config = require('./config');

const builtin = [
  {
    name: 'desktop:notepad',
    surface: 'desktop',
    app: 'notepad',
    launch: 'notepad',
    procName: 'notepad',
    title: 'Notepad',
    url: 'desktop://notepad',
    task: '打开记事本，在编辑区输入文字：多模态Agent桌面控制测试，然后确认这段文字已经出现在记事本里',
    verifyText: '多模态Agent桌面控制测试',
    allowActions: ['type', 'wait', 'done'],
    maxSteps: 8,
    desc: '桌面应用：Notepad 输入并验证（演示电脑控制）',
  },
  {
    name: 'desktop:demoapp',
    surface: 'desktop',
    app: 'demoapp',
    launch: "powershell -NoProfile -ExecutionPolicy Bypass -File \"" + path.join(config.dirs.root, 'scripts', 'demo-app.ps1') + "\"",
    procName: 'powershell',
    title: '多模态Agent测试窗',
    task: '在测试窗的输入框里输入文字：多模态Agent桌面控制测试，然后确认这段文字已经出现在输入框里',
    verifyText: '多模态Agent桌面控制测试',
    maxSteps: 8,
    allowActions: ['type', 'wait', 'done'],
    desc: '桌面应用：自定义 WPF 测试窗（无会话恢复，安全演示电脑控制）',
  },
  {
    name: 'local-login',
    url: 'file:///' + path.join(config.dirs.pages, 'demo.html').replace(/\\/g, '/'),
    task: '在页面上找到登录表单：输入用户名 demo、密码 123456，点击登录按钮，最后确认页面出现欢迎文字',
    verifyText: '欢迎',
    maxSteps: 10,
    desc: '本地离线测试页（登录表单）',
  },
  {
    name: 'saucedemo-login',
    url: 'https://www.saucedemo.com/',
    task: '在登录页输入用户名 standard_user、密码 secret_sauce，点击 Login 按钮，进入后确认页面出现 Products（商品列表）',
    verifyText: 'Products',
    maxSteps: 12,
    desc: '真实网页：SauceDemo 登录（自动化测试演示站）',
  },
  {
    name: 'example',
    url: 'https://example.com/',
    task: '打开页面后，说出页面上最大的标题是什么，然后结束',
    verifyText: '',
    maxSteps: 6,
    desc: '真实网页：最简单的只读任务（用于冒烟测试）',
  },
];

function resolve(nameOrUrl, overrides) {
  let t = null;
  if (nameOrUrl && !/^https?:\/\//i.test(nameOrUrl) && !/^file:/i.test(nameOrUrl)) {
    t = builtin.find(function (x) { return x.name === nameOrUrl; }) || null;
  }
  if (!t) {
    // 视为 URL：用默认只读任务
    t = { name: 'custom', url: nameOrUrl || config.url, task: '', verifyText: '', maxSteps: 10, desc: '自定义 URL 任务' };
  }
  return Object.assign({}, t, overrides || {});
}

module.exports = { builtin, resolve };