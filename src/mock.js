'use strict';
// 离线感知（mock 眼睛）：不调用视觉 API，直接用 DOM 直读得到结构化观察
// 用途：离线自测、无 key 降级、调试

function guessState(bodyText) {
  if (/欢迎|welcome/i.test(bodyText)) return 'welcome';
  if (/Products|商品|产品|inventory/i.test(bodyText)) return 'products';
  if (/登录|Login|username|user-name|password/i.test(bodyText)) return 'login_form';
  return 'unknown';
}

async function perceiveDom(hands) {
  const state = await hands.pageState();
  const elements = await hands.domElements();
  const headings = elements.filter(function (e) { return e.type === 'heading'; }).map(function (e) { return e.text; });
  const summary = '页面标题：' + (state.title || '') + '；主要标题：' + (headings.join('、') || '无') + '；可交互元素 ' + elements.length + ' 个。';
  return {
    summary: summary,
    state: guessState(state.bodyText),
    elements: elements,
    bodyText: state.bodyText,
  };
}


// 桌面离线感知：无视觉 API 时用 UIAutomation 文本直读
async function perceiveDesktop(hands) {
  const st = await hands.pageState();
  const text = (st.bodyText || '').slice(0, 800);
  return {
    summary: '桌面窗口：' + (st.title || '') + '；可读文本：' + (text.slice(0, 120) || '无'),
    state: guessState(text),
    elements: [],
    bodyText: text,
  };
}

module.exports = { perceiveDom, perceiveDesktop, guessState };