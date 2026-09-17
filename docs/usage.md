# 使用手册

## 前置条件
- Node.js ≥ 18
- Microsoft Edge（默认路径在 `.env` 可改，也可指向 Chrome）
- `.env` 中 `KIMI_API_KEY`（眼睛）；DeepSeek 默认走本机 cc-switch 代理 `http://127.0.0.1:15721/v1`，可改

## 命令
| 命令 | 说明 |
|---|---|
| `.\scripts\setup.ps1` | 安装依赖 + 生成 .env |
| `npm run self-test` | 离线自测（mock，不联网） |
| `npm run task:local` | 本地测试页登录（live） |
| `npm run task:sauce` | SauceDemo 真实网页登录（live） |
| `npm run task:example` | example.com 只读冒烟 |
| `node src/run.js <URL> --task=...` | 自定义 URL 任务 |
| `node src/run.js <任务名> --mock` | mock 模式跑内置任务 |
| `node src/run.js <任务名> --headful` | 有头模式（看浏览器） |
| `node src/run.js <任务名> --steps=15` | 覆盖最大步数 |
| `node src/run.js <任务名> --verify=文本` | 覆盖最终校验文本 |

## 任务定义
内置任务在 `src/tasks.js`，字段：`name / url / task / verifyText / maxSteps / desc`。
自定义 URL：直接传 URL，任务描述用 `--task=` 或环境变量 `TASK`。

## 配置项（.env）
| 变量 | 默认 | 说明 |
|---|---|---|
| `KIMI_API_KEY` | （必填） | 多模态视觉 API key（Moonshot/Kimi） |
| `KIMI_VISION_MODEL` | `kimi-k2.6` | 视觉模型（k2.6 支持关思考，输出稳定） |
| `DEEPSEEK_BASE_URL` | `http://127.0.0.1:15721/v1` | DeepSeek OpenAI 兼容地址 |
| `DEEPSEEK_API_KEY` | `PROXY_MANAGED` | DeepSeek key |
| `DEEPSEEK_MODEL` | `deepseek-v4-flash` | 大脑模型 |
| `EDGE_PATH` | Edge 默认路径 | 浏览器可执行文件 |
| `HEADLESS` | `true` | 无头/有头 |
| `VIEWPORT_WIDTH/HEIGHT` | `1280/800` | 视口（截图坐标基准） |
| `RUN_MODE` | `live` | `live`/`mock` |
| `MAX_STEPS` | `10` | 最大步数 |

## 产物
- `output/screenshots/<runId>/`：每步截图
- `output/reports/<runId>.json`：完整报告（动作历史、最终状态、结果）
- `data/logs/run-*.log`：运行日志
## 桌面任务
| 命令 | 说明 |
|---|---|
| `node src/run.js desktop:demoapp` | 自定义 WPF 测试窗：输入文字并验证（推荐，无会话恢复） |
| `node src/run.js desktop:notepad` | 记事本：输入文字并验证 |

桌面任务安全说明：默认 `allowActions=['type','wait','done']`，输入走 `TypeSafe`（先验证前台再输入）。如需允许点击，可在任务定义里加 `allowActions: ['click','type','wait','done']`。

## 大脑说明
大脑请求已加 `thinking:{type:'disabled'}`：关闭 DeepSeek 推理展示，保证稳定快速输出 JSON（决策不需要长思考）。
## 成本优化命令
| 命令 | 说明 |
|---|---|
| `npm run cost-test` | 离线测试哈希/裁剪（不联网） |
| `npm run demo:cost` | 在线演示 ROI 裁剪的 token 节省 |
| `npm run demo:cache` | 在线演示截图缓存命中 |
| `npm run demo:roi` | 在线演示 inspect 全链路（放大→重决策） |

环境变量：`MAX_INSPECTS`（默认 3）限制每轮 ROI 放大次数。运行报告含 `stats` 成本统计。
## 队列 / 定时任务
| 命令 | 说明 |
|---|---|
| `npm run queue` | 跑默认演示队列（local-login mock + saucedemo live） |
| `npm run queue:demo` | 用 `data/tasks/queue.example.json` 文件跑队列 |
| `node src/run-queue.js my-queue.json` | 自定义队列文件 |
| `node src/run-queue.js --tasks=a,b,c` | 内联任务名队列 |
| `node src/run-queue.js my.json --retry=2` | 全部任务失败重试 2 次 |
| `npm run schedule:preview` | 预览计划任务命令（不注册） |
| `.\scripts\schedule.ps1 -Time 09:00` | 注册每日 09:00 计划任务 |
| `.\scripts\schedule.ps1 -Remove` | 删除计划任务 |

队列文件格式（`data/tasks/queue.example.json`）：数组，每项为任务名或对象：`{name, mode?, retry?, task?, verifyText?, maxSteps?}`。
队列汇总报告：`output/reports/queue-<时间>.json`。