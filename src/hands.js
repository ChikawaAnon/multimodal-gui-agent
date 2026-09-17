'use strict';
// 手：Playwright 驱动 Edge。支持真实浏览器操作 + DOM 直读（可作离线“眼睛”）
const { chromium } = require('playwright-core');
const config = require('./config');
const logger = require('./logger');

class Hands {
  constructor(browser, context, page) { this.browser = browser; this.context = context; this.page = page; }

  static async launch(url) {
    const browser = await chromium.launch({
      executablePath: config.browser.edgePath,
      headless: config.browser.headless,
      args: ['--no-sandbox', '--disable-blink-features=AutomationControlled'],
    });
    const context = await browser.newContext({
      viewport: config.browser.viewport,
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    const hands = new Hands(browser, context, page);
    await hands.goto(url);
    return hands;
  }

  async goto(url) {
    logger.info('[hands] 打开 ' + url);
    await this.page.goto(url, { waitUntil: 'load', timeout: config.browser.timeout }).catch(function (e) {
      logger.warn('[hands] goto 警告: ' + e.message);
    });
    await this.wait(800);
  }

  async screenshot() { return this.page.screenshot({ type: 'png' }); }

  async pageState() {
    return {
      url: this.page.url(),
      title: await this.page.title().catch(function () { return ''; }),
      bodyText: (await this.page.locator('body').innerText().catch(function () { return ''; })).slice(0, 1000),
    };
  }

  async wait(ms) { await this.page.waitForTimeout(ms || 500); }

  async scroll(dx, dy) {
    await this.page.mouse.wheel(dx || 0, dy || 300);
    await this.wait(300);
  }

  // ---- DOM 直读：把页面元素转成和“视觉眼睛”相同的结构化格式（离线可用） ----
  async domElements() {
    const out = [];
    const grab = async function (loc, type) {
      const n = await loc.count().catch(function () { return 0; });
      for (let i = 0; i < Math.min(n, 12); i++) {
        const el = loc.nth(i);
        const box = await el.boundingBox().catch(function () { return null; });
        if (!box) continue;
        const inner = (await el.innerText().catch(function () { return ''; })) || '';
        const ph = (await el.getAttribute('placeholder').catch(function () { return null; })) || '';
        const val = (await el.inputValue().catch(function () { return ''; })) || '';
        const text = inner.trim() || val || ph;
        if (text.trim()) {
          const e = { type: type, text: text.trim().slice(0, 60), bbox: [box.x, box.y, box.width, box.height] };
          if (type === 'input') { e.value = val; e.placeholder = ph; }
          out.push(e);
        }
      }
    };    await grab(this.page.locator('button, [role=button], input[type=submit], input[type=button]'), 'button');
    await grab(this.page.locator('input:not([type=hidden]), textarea'), 'input');
    await grab(this.page.locator('a'), 'link');
    await grab(this.page.locator('h1, h2, h3'), 'heading');
    return out;
  }

  // 优先 DOM 文本定位，失败再用视觉 bbox
  async clickByTarget(target, bbox) {
    if (target) {
      const ok = await this._clickByText(String(target));
      if (ok) { logger.info('[hands] 点击(按文本): ' + target); return 'click:' + target + ' (DOM)'; }
    }
    if (bbox && Array.isArray(bbox) && bbox.length === 4) {
      const cx = bbox[0] + bbox[2] / 2;
      const cy = bbox[1] + bbox[3] / 2;
      await this.page.mouse.click(cx, cy);
      await this.wait(300);
      logger.info('[hands] 点击(按坐标): ' + cx + ',' + cy);
      return 'click bbox [' + bbox.join(',') + ']';
    }
    throw new Error('hands: 无法定位点击目标 target=' + target + ' bbox=' + JSON.stringify(bbox));
  }

  async _clickByText(text) {
    const esc = String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const sels = [
      'button:has-text("' + esc + '")',
      'a:has-text("' + esc + '")',
      '[role=button]:has-text("' + esc + '")',
      'input[type=submit]:has-text("' + esc + '")',
    ];
    for (const sel of sels) {
      const loc = this.page.locator(sel).first();
      if (await loc.count()) { await loc.click({ timeout: 3000 }).catch(function () {}); return true; }
    }
    const any = this.page.getByText(text, { exact: false }).first();
    if (await any.count()) { await any.click({ timeout: 3000 }).catch(function () {}); return true; }
    return false;
  }

  async typeIntoInput(text, target) {
    let input = null;
    if (target) {
      const esc = String(target).replace(/"/g, '');
      const byPh = this.page.locator('input[placeholder*="' + esc + '"], textarea[placeholder*="' + esc + '"]').first();
      if (await byPh.count()) input = byPh;
    }
    if (!input) {
      const inputs = this.page.locator('input:visible:not([type=hidden]), textarea:visible');
      if (await inputs.count()) input = inputs.first();
    }
    if (!input) throw new Error('hands: 页面上没有可见输入框');
    await input.click({ timeout: 3000 });
    await input.fill(String(text)).catch(function () { return input.type(String(text)); });
    await this.wait(200);
    logger.info('[hands] 输入: ' + String(text).slice(0, 40));
  }

  async pressEnter() { await this.page.keyboard.press('Enter'); await this.wait(500); }

  async close() { try { await this.browser.close(); } catch (e) {} }
}

module.exports = Hands;