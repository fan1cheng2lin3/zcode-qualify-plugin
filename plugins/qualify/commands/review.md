---
description: 评审 — 对照定性表完成条件 + git diff + build/test,生成评审报告。读代码状态,不读对话历史。
argument-hint: "<phase-id>"
skills: review
---

使用 `review` skill 处理这个请求:

$ARGUMENTS

执行要点:
1. 读 `<workspace>/docs/phases/phase-{X}.md` 槽 5(完成条件)— 这是评审对照的基准
2. 跑确定性命令收集"执行摘要"(零 token):`git diff --stat` + build + test + grep 指纹
3. 逐条对照完成条件,标 ✅/❌ + 证据
4. 输出到 `<workspace>/docs/reviews/phase-{X}-review.md`
5. 若未通过,写"下一轮指令"段(给定量 agent)
