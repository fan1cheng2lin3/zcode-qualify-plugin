---
description: 定量 — 读定性填空表(7 槽) + 项目档案 + 规矩库,渲染出 tasks.json + goal 提示词。
argument-hint: "<phase-id> [--round N]"
skills: quantify
---

使用 `quantify` skill 处理这个请求:

$ARGUMENTS

执行要点:
1. 读 `<workspace>/docs/phases/phase-{X}.md`(定性填空表 7 槽)
2. 读 `<workspace>/project.profile.md`(项目档案,含 goal 骨架/流程骨架/技术栈)
3. 读 `<workspace>/docs/constraints/*.md`(规矩库,按本 Phase 涉及的大类过滤)
4. 若有上一轮评审报告 `<workspace>/docs/reviews/phase-{X}-review.md`,读"下一轮指令"段
5. 按 skill 指令渲染,输出到 `<workspace>/.qualify/phase-{X}/tasks.json` + `goal.md`
