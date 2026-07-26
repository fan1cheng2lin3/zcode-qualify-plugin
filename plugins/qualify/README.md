# zcode-qualify-plugin

> 定性 → 定量 → 评审 → auto-run,全栈 AI 开发流程插件。
> **防腐化核心:状态落在文件里(tasks.json / review 报告 / git commit),不靠对话上下文记忆。**

适用于"定性错了会推翻一堆代码"的复杂模块(聚合根 / 跨模块协作 / 涉钱逻辑)。
**简单模块(加字段 / 改文案 / 调样式)请直接跳过本插件,手动写代码更快。**

---

## 这是什么

一套给 ZCode 用的开发流程插件,把"头脑风暴 → 收敛 → 拆任务 → 执行 → 评审"结构化:

| 阶段 | 命令 | 干啥 |
|---|---|---|
| 定性 | `/qualify <需求>` | 发散 + 收敛,产出 7 槽定性表(`docs/phases/phase-{X}.md`) |
| 定量 | `/quantify <phase>` | 读定性表 + 规矩库,渲染 tasks.json + goal 提示词 |
| 执行 | `/run-goal <phase>` | 按调度算法派子代理执行任务 |
| 评审 | `/review <phase>` | 对照完成条件生成评审报告(读 git diff,不读对话) |
| 自动 | `/auto-run [-n]` | 自动扫描所有未完成 phase 串行跑完(夜间模式 `-n`) |

**辅助命令**:`/init`(初始化 workspace)、`/constraints`(规矩库管理)。

---

## 安装

### 方式 1:从 Marketplace 安装(推荐)

1. ZCode → **Settings → Plugins → Marketplace**
2. 点 **+**,填本仓库地址:`<你的 GitHub 用户名>/zcode-qualify-plugin`
3. 添加后找到 **qualify** 插件 → 点 **获取** → 默认启用
4. 新建会话,敲 `/qualify 测试需求` 验证

### 方式 2:本地开发安装

```bash
git clone <仓库地址>
# ZCode → Settings → Plugins → Marketplace → +
# 填本地仓库的绝对路径
```

修改插件文件后,在 ZCode 界面点"刷新"即可重新加载。

---

## 依赖

### 必需
- **ZCode 客户端**(支持 plugin / hook 机制的版本)
- **Node.js ≥ 18**(hooks 脚本用 `.cjs`,需要原生 fetch / 现代语法)

### 可选(仅飞书通知功能需要)
- **lark-cli**(飞书命令行):用于评审完成 / auto-run 卡住时发飞书通知
  - 没装也能用,通知会走 fallback 写本地日志(`workspace/.qualify/notify-fallback.log`)
  - 要启用:安装 lark-cli 后,`cp hooks/notify.local.json.example hooks/notify.local.json`,填你的 `ou_xxx` open_id

---

## 平台兼容

| 平台 | 支持 | 说明 |
|---|---|---|
| Windows | ✅ | 已实测。lark-cli 的 .cmd shim 有专门处理 |
| macOS | ✅ | 脚本按 `process.platform` 分支,非 Win 走标准路径 |
| Linux | ✅ | 同 macOS |

---

## 快速上手

### 场景 A:复杂模块,走完整流程
```
/init                    # 首次:初始化 workspace 结构
/qualify 做一个订单系统   # 定性(发散+收敛,产出 phase-A.md)
/quantify A              # 定量(产出 tasks.json + goal.md)
/run-goal A              # 执行(派子代理跑任务)
/review A                # 评审(对照完成条件)
# 通过 → /quantify B → ... 串行推进
```

### 场景 B:多 phase 夜间自动跑
```
/auto-run -n             # 自动扫描所有未完成 phase,夜间模式不问你
# 睡觉,早上看飞书通知知道跑成啥样
```

---

## 目录结构(插件内部)

```
zcode-qualify-plugin/
├── .zcode-plugin/plugin.json   # 插件清单
├── commands/                   # 6 个命令定义
├── hooks/                      # 钩子(SessionStart/Stop/PostToolUse)
├── skills/                     # 3 个 skill(qualify/quantify/review)
├── templates/                  # 定性表/goal/评审报告模板
└── README.md
```

---

## 产物落在哪里(运行时)

所有运行产物都在你项目的 `workspace/` 下:
- `workspace/docs/phases/phase-{X}.md` — 定性表
- `workspace/docs/constraints/` — 规矩库(每条一个文件)
- `workspace/.qualify/{phase}/` — 定量产物(tasks.json + goal.md)
- `workspace/docs/reviews/phase-{X}-review.md` — 评审报告

---

## 版本

见 [CHANGELOG.md](./CHANGELOG.md)。当前 **0.1.0**。

## License

MIT
