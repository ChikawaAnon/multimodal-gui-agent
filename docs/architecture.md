# 架构与设计决策

## 1. 分层
| 层 | 文件 | 职责 |
|---|---|---|
| 大脑 | `src/brain.js` | DeepSeek（OpenAI 兼容）根据结构化观察输出 JSON 动作；规则兜底 |
| 眼睛 | `src/eyes.js` / `src/mock.js` | live：现成多模态 API（Kimi/Moonshot）截图→结构化；mock：DOM 直读 |
| 手 | `src/hands.js` | Playwright 驱动 Edge：截图/点击/输入/滚动/页面状态 |
| 编排 | `src/agent.js` | 主循环：感知→决策→执行→验证；无进展检测；报告归档 |
| 任务 | `src/tasks.js` | 内置任务注册表 + 自定义 URL 任务 |
| 配置 | `src/config.js` | .env + 环境变量 + CLI 覆盖 |

## 2. 关键设计
### 2.1 结构化感知（不是看图说话）
视觉模型被强制输出 `{summary, state, elements:[{type,text,bbox}]}`，bbox 坐标可被手直接消费。

### 2.2 坐标归一化兼容
部分视觉模型返回 0~1 归一化坐标，`eyes.js` 在收到后按视口自动换算为像素坐标（`bbox` 全在 [0,1] 时触发）。

### 2.3 思考 token 预算问题（重要坑）
`kimi-k2.7-code` 强制开启思考，`reasoning_content` 占用 completion token 预算，导致正文 JSON 被截断。
解决：默认视觉模型改用 `kimi-k2.6` 并传 `thinking:{type:'disabled'}`，JSON 输出稳定。

### 2.4 DOM 优先 + bbox 兜底
点击时先按 target 文本用 DOM 定位（准），失败才用视觉 bbox 坐标（可能受 DPI/归一化影响）。

### 2.5 闭环验证
每个动作后重新截图感知；`done` 也要由最终页面状态校验（verifyText 命中）才算成功，避免‘盲人开车’。

### 2.6 容错与降级
- 视觉 JSON 解析失败 → 自动重试一次（更严格提示）。
- 大脑 JSON 解析失败 → 自动重试一次；仍失败 → 规则兜底。
- 无进展检测：连续 3 步页面无变化提前结束，防死循环。
- 网络错误页等异常状态：大脑可识别并点击刷新恢复。

### 2.7 运行模式
| 模式 | 眼睛 | 大脑 | 用途 |
|---|---|---|---|
| `live` | 多模态 API | DeepSeek（失败降级规则） | 真实任务 |
| `mock` | DOM 直读 | 规则 | 离线自测 / 无 key / 调试 |

## 3. 已知局限
- 仅网页场景；桌面控制需替换 hands 为 UIAutomation/pyautogui。
- 无截图缓存与 ROI 裁剪（下一步成本优化项）。
- bbox 精度依赖视觉模型；生产建议加坐标对齐校验。
## 4. 桌面控制（surface=desktop）
| 层 | 实现 |
|---|---|
| 手 | `src/hands-desktop.js` + `scripts/desktop.ps1`（UIAutomation / user32 / PrintWindow / SendKeys） |
| 眼睛 | `WindowShot`：按窗口标题用 PrintWindow 截取窗口内容（被遮挡也能拍到），不依赖前台 |
| 输入 | `TypeSafe`：激活 → **验证前台=目标窗口** → 点击编辑框 → 清空 → 剪贴板粘贴；验证失败安全中止，绝不乱发按键 |
| 验证 | `UiText`：按窗口标题枚举后代文本（UIA Value/TextPattern） |
| 生命周期 | 启动记录 PID/StartTime，close 只结束本次启动的进程，不误杀用户已有窗口 |

### 4.1 关键坑与解决（详见避坑日志）
- 新版记事本「会话恢复」：被强制结束后下次启动会恢复上次内容（甚至用户文档）→ demo 改用自定义 WPF 测试窗（无恢复）。
- 任务杀进程：`taskkill /IM` 会误杀用户同名的窗口 → 改为按启动时间/标题精确清理。
- PowerShell 读 .ps1：UTF-8 无 BOM 会被按 GBK 解析，中文 XAML 乱码 → 中文 .ps1 必须存 UTF-8 BOM。
- UIA 枚举有时返回 0：先启动任意 GUI 才可枚举 → 增加重试；桌面任务流程本身先启动应用再操作。
- DeepSeek 思考占满 token：`max_tokens` 给大时推理吃满预算导致 content 为空 → 大脑请求加 `thinking:{type:'disabled'}`。

## 5. 成本优化（截图缓存 + ROI 裁剪）
- `src/imgutil.js`：`hashPng`（降采样像素哈希，判定画面是否变化）+ `cropPng`（按 bbox+margin 裁剪子图）。
- 截图缓存：agent 每步先哈希；与上一步一致则复用上次观察（`stats.cacheHits++`），否则调视觉（`stats.visionCalls++`）。
- ROI：大脑可发 `inspect`（带 target/bbox）→ 裁剪放大 → 视觉重看 → 合并为 `obs.detail` → 大脑重新决策；有 `MAX_INSPECTS` 上限防循环。
- 统计：每次运行报告 `stats`（视觉调用/缓存命中/ROI 次数/裁剪节省字节）。
- 实测：ROI 单次省 58%~64% token；画面不变的步骤缓存命中省整次调用。

## 6. 多任务队列 / 定时任务
- `src/queue.js`：顺序执行；每项支持 `mode` 覆盖（运行前临时改 `config.mode`，结束后恢复）、`retry` 失败重试、继续执行不中断。
- `src/run-queue.js`：CLI，支持队列文件 / `--tasks=` 内联 / 默认演示队列。
- `scripts/schedule.ps1`：schtasks 注册每日定时任务（`-DryRun` 预览）。计划任务运行于非交互会话 → 仅适合 headless 网页任务。
- 产物：`output/reports/queue-<时间>.json`（通过率、每任务结果、尝试次数、总耗时）。
