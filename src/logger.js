'use strict';
// 极简日志：控制台 + 文件
const fs = require('node:fs');
const path = require('node:path');
const config = require('./config');

function ts() { return new Date().toLocaleString('zh-CN', { hour12: false }); }

const logger = {
  file: null,
  init() {
    try {
      fs.mkdirSync(config.dirs.logs, { recursive: true });
      const name = 'run-' + new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19) + '.log';
      this.file = path.join(config.dirs.logs, name);
      fs.writeFileSync(this.file, '');
    } catch (e) { this.file = null; }
  },
  write(level, msg) {
    const line = '[' + ts() + '][' + level + '] ' + msg;
    if (level === 'error') console.error(line); else if (level === 'warn') console.warn(line); else console.log(line);
    if (this.file) { try { fs.appendFileSync(this.file, line + '\n'); } catch (e) {} }
  },
  info(m) { this.write('info', m); },
  warn(m) { this.write('warn', m); },
  error(m) { this.write('error', m); },
  section(m) { this.info(''); this.info('==== ' + m + ' ===='); },
};

module.exports = logger;