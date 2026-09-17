'use strict';
// 手（桌面版）：通过 PowerShell + UIAutomation/user32 控制原生桌面应用（按窗口标题定位）
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const config = require('./config');
const logger = require('./logger');
const TMP = path.join(config.dirs.root, 'data', 'tmp');
fs.mkdirSync(TMP, { recursive: true });
function tmpFile(prefix, ext) { return path.join(TMP, prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6) + ext); }

const PS1 = path.join(config.dirs.root, 'scripts', 'desktop.ps1');
const PS = 'powershell.exe';
const PS_ARGS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', PS1];

// 把启动命令转成 Start-Process 语句
function buildStart(launch) {
  const parts = String(launch).match(/(?:[^\s"]+|"[^"]*")+/g) || [String(launch)];
  const clean = parts.map(function (p) { return p.replace(/^"|"$/g, ''); });
  if (clean.length === 1) return "$p = Start-Process '" + clean[0] + "' -PassThru; $p.Id";
  const args = clean.slice(1).map(function (a) { return "'" + a.replace(/'/g, "''") + "'"; }).join(',');
  return "$p = Start-Process '" + clean[0] + "' -ArgumentList " + args + " -PassThru; $p.Id";
}

class DesktopHands {
  constructor() { this.selfLaunched = false; this.pid = null; this.startTime = null; this.title = ''; this.procName = ''; }

  static async launch(spec) {
    const h = new DesktopHands();
    h.title = spec.title || spec.app || '';
    h.procName = spec.procName || spec.app || '';
    if (spec.launch) {
      logger.info('[桌面手] 启动: ' + spec.launch);
      h.startTime = new Date();
      const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', buildStart(spec.launch)], { encoding: 'utf8' }).trim();
      const m = out.match(/(\d+)/); h.pid = m ? Number(m[1]) : null;
      h.selfLaunched = true;
      await h.wait(1800);
    }
    return h;
  }

  async wait(ms) { await new Promise(function (r) { setTimeout(r, ms); }); }

  _run(args) {
    return execFileSync(PS, PS_ARGS.concat(args), { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();
  }

  async screenshot() {
    const tmp = tmpFile('ds-shot', '.png');
    this._run(['-Action', 'Screenshot', '-OutFile', tmp]);
    const buf = fs.readFileSync(tmp);
    try { fs.unlinkSync(tmp); } catch (e) {}
    return buf;
  }

  async windowShot(title) {
    const tmp = tmpFile('ds-winshot', '.png');
    const out = this._run(['-Action', 'WindowShot', '-Title', title || this.title, '-OutFile', tmp]);
    if (!fs.existsSync(tmp)) throw new Error('windowShot 未生成截图: ' + out);
    const buf = fs.readFileSync(tmp);
    try { fs.unlinkSync(tmp); } catch (e) {}
    const parts = out.split(/\s+/).map(Number);
    const rect = (parts.length === 4 && parts.every(Number.isFinite)) ? { x: parts[0], y: parts[1], w: parts[2], h: parts[3] } : null;
    return { buffer: buf, rect: rect };
  }

  async click(x, y) {
    this._run(['-Action', 'Click', '-X', String(Math.round(x)), '-Y', String(Math.round(y))]);
    await this.wait(200);
    return 'click ' + Math.round(x) + ',' + Math.round(y);
  }

  async type(text) {
    const out = this._run(['-Action', 'TypeSafe', '-Title', this.title, '-Content', String(text)]);
    await this.wait(300);
    if (out.indexOf('not-foreground') !== -1) throw new Error('桌面输入安全中止：目标窗口未被置为前台，未发送任何按键');
    if (out.indexOf('no-window') !== -1) throw new Error('桌面输入失败：未找到目标窗口');
    return 'typeSafe:' + String(text).slice(0, 40);
  }

  async pressEnter() {
    this._run(['-Action', 'Key', '-Keys', '{ENTER}']);
    await this.wait(300);
  }

  async activateWindow(title) {
    this._run(['-Action', 'Activate', '-Title', title || this.title]);
    await this.wait(400);
  }

  async windows() {
    const tmp = tmpFile('ds-wins', '.json');
    this._run(['-Action', 'Windows', '-OutFile', tmp]);
    const raw = fs.readFileSync(tmp, 'utf8').replace(/^\uFEFF/, '');
    try { fs.unlinkSync(tmp); } catch (e) {}
    try { return JSON.parse(raw); } catch (e) { return []; }
  }

  async uiText(title) {
    const tmp = tmpFile('ds-ui', '.json');
    this._run(['-Action', 'UiText', '-OutFile', tmp].concat((title || this.title) ? ['-Title', String(title || this.title)] : []));
    const raw = fs.readFileSync(tmp, 'utf8').replace(/^\uFEFF/, '');
    try { fs.unlinkSync(tmp); } catch (e) {}
    try { return JSON.parse(raw); } catch (e) { return { text: '', count: 0 }; }
  }

  async pageState(title) {
    const wins = await this.windows();
    const ui = await this.uiText(title);
    return { url: 'desktop://' + this.title, title: (wins[0] && wins[0].name) || '', bodyText: ui.text || '', ui: ui };
  }

  async close() {
    if (!this.selfLaunched) return;
    if (this.pid) {
      try { execFileSync('taskkill', ['/PID', String(this.pid), '/F'], { stdio: 'ignore' }); } catch (e) {}
    }
    if (this.procName && this.startTime) {
      const ps = "Get-Process -Name '" + this.procName + "' -ErrorAction SilentlyContinue | Where-Object { $_.StartTime -ge [datetime]'" + this.startTime.toISOString() + "' } | ForEach-Object { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue }";
      try { execFileSync('powershell.exe', ['-NoProfile', '-Command', ps], { stdio: 'ignore' }); } catch (e) {}
    }
  }
}

module.exports = DesktopHands;