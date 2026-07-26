---
description: 初始化 — 在当前项目搭建"定性→定量→评审"工作环境(目录骨架 + 模板 + 项目档案 + git)。
argument-hint: "[--force]"
---

在当前项目根目录下初始化"定性定量"工作环境。这是新项目用这套流程的第一步。

## 检测:是否已初始化

读 `<项目根>/workspace/project.profile.md`:
- **存在 + `--force` 未传**:告诉用户"已初始化,如需重建加 --force",停止。
- **不存在 或 传了 `--force`**:继续往下建。

## 建目录骨架

在 `<项目根>/workspace/` 下建:

```
workspace/
├── docs/
│   ├── constraints/    ← 规矩库
│   ├── adr/            ← ADR 历史
│   ├── phases/         ← 定性产物(填空表)
│   └── reviews/        ← 评审报告
├── templates/          ← 模板(从插件复制)
└── .qualify/           ← 定量产物输出(运行时填)
```

## 复制模板

从 `${ZCODE_PLUGIN_ROOT}/templates/`(散装模式:从 `~/.zcode/commands/../skills/quantify/../../` 找不到则用内置 fallback)复制以下 5 个文件到 `workspace/templates/`:

- `qualification-form.md`(定性填空表 7 槽)
- `review-report.md`(评审报告)
- `constraint.md`(规矩文件)
- `goal-prompt.md`(goal 提示词骨架)
- `tasks.json`(tasks 骨架)

**fallback**:若插件 templates 路径找不到,用你内置的模板内容直接写(你知道这些模板长啥样)。

## 建规矩库 README

写 `workspace/docs/constraints/README.md`,内容:

```md
# 规矩库 (Constraints Store)

> 活跃约束的累积库。每条规矩一个小文件,按十大类打标签。
> 定性开始时,工具按当前 Phase 涉及的大类,自动抽相关规矩注入。
> 约束可过期:被推翻时标 superseded,不删除。

## 十大类标签

money / architecture / cache / testing / security / naming / database / frontend / persistence / other

## 怎么加规矩

定性填空表槽 3.5(New Constraints)填入 → 定性结束自动入库。
手动补漏用 `/constraints add`。

## 文件格式

见 `templates/constraint.md`。
```

## 生成项目档案(让用户填)

写 `workspace/project.profile.md`,内容是模板,带占位符让用户填:

```md
# 项目档案 (Project Profile)

> 静态配置。换项目才改,日常不动。可复制、可版本控制。

## 基本信息
- **项目名**:{填}
- **定位**:{填}
- **创建于**:{今天日期}

## 技术栈
- **后端**:{填,如 .NET 10 / Python / Node}
- **前端**:{填,如 Vue 3 / React / 无}
- **数据库**:{填,如 PostgreSQL / MySQL}
- **包管理**:{填}

## 分层规则
{填,如 Domain 零依赖 / 单体 / 无分层}

## 流程骨架(goal 提示词的段 5/6/7/8 抄这里,所有 Phase 共用)

\`\`\`
【调度算法】
1. 读 tasks.json,找 status=pending 且 dependencies 都 completed 中 priority 最小的任务
2. 标记 in_progress
3. 用 Agent 工具派子代理(前台)
4. 解析报告 STATUS
5. 更新 tasks.json
6. 循环直到全 completed 或全 blocked

【派子代理 prompt 必须包含】
任务全字段 + 保护铁律 + 工作目录 + 必读 + 执行步骤 + 暂停条件 + 报告格式

【每轮报告(≤ 300 字)】
{id} → {状态} | {completed}/N | 下一个 | 阻塞

【状态机】pending→in_progress→completed;needs_human/failed/blocked。
\`\`\`

## 命名约定
- 定性产物:`docs/phases/phase-{X}.md`
- 定量产物:`.qualify/{phase}/tasks.json` + `goal.md`
- 评审报告:`docs/reviews/phase-{X}-review.md`
- 规矩:`docs/constraints/{NNN}-{标题}.md`
- ADR:`docs/adr/ADR-{NNN}-{标题}.md`

## 十大类标签(规矩库用)
money / architecture / cache / testing / security / naming / database / frontend / persistence / other
```

## git init(若未初始化)

跑 `git rev-parse --is-inside-work-tree`:
- **报错(未初始化)**:跑 `git init`
- **已初始化**:跳过

git 是评审的基础(评审用 git diff 看改了啥),必须就绪。

## 完成后告诉用户

```
✓ 定性定量环境已初始化

建了:
  workspace/docs/{constraints,adr,phases,reviews}/
  workspace/templates/(5 个模板)
  workspace/.qualify/
  workspace/project.profile.md ← 填我(技术栈/分层/命名约定)
  workspace/docs/constraints/README.md
  git:已初始化

下一步:
  1. 编辑 workspace/project.profile.md 填项目信息
  2. 敲 /qualify 开始第一个 Phase 的定性
```
