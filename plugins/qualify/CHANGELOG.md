# Changelog

## 0.1.0 (2026-07-26)

### 首次上架

**核心流程**
- 定性(`/qualify`):发散 + 收敛,产出 7 槽定性表
- 定量(`/quantify`):读定性表 + 项目档案 + 规矩库,渲染 tasks.json + goal 提示词
- 执行(`/run-goal`):按调度算法派子代理执行,状态落在 tasks.json
- 评审(`/review`):对照完成条件生成评审报告(读 git diff,不读对话)
- 自动(`/auto-run`):自动扫描未完成 phase 串行跑完,支持夜间模式 `-n`

**钩子**
- `SessionStart`:注入规矩库约束到上下文
- `Stop`:执行层跑完提示评审
- `PostToolUse`:评审报告变更自动发飞书通知(可选)

**辅助**
- 规矩库管理(`/constraints`)
- workspace 初始化(`/init`)
- 飞书通知 + 任务同步(可选,需 lark-cli)

**平台**
- Windows / macOS / Linux 均支持
