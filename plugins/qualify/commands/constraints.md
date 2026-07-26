---
description: 规矩库 — 浏览/搜索/管理活跃约束(规矩库)。
argument-hint: "[list|tag <大类>|add|deprecate <编号>]"
---

管理 `<workspace>/docs/constraints/` 规矩库。

## 子命令

- **`/constraints list`** — 列所有 active 规矩(编号 + 标题 + 标签)
- **`/constraints tag <大类>`** — 按十大类过滤(money/architecture/cache/testing/security/naming/database/frontend/persistence/other)
- **`/constraints add`** — 交互式加一条新规矩(按 `templates/constraint.md` 格式,自动编号)
- **`/constraints deprecate <编号>`** — 标一条规矩为 superseded(需先加 ADR 记原因,再改 status + superseded_by)

## 规矩文件格式

见 `templates/constraint.md`(yaml frontmatter:tag/status/from/superseded_by/phases + 规矩正文 + 例外)。

$ARGUMENTS

**注**:日常加规矩走定性填空表槽 3.5(自动入库)。本命令用于:手动补漏 / 管理作废 / 浏览查询。
