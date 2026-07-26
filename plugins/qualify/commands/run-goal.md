---
description: 执行 — 读定量产物(tasks.json + goal.md),启动执行层跑任务。
argument-hint: "<phase-id>"
---

读 `<workspace>/.qualify/phase-{X}/goal.md` 和 `tasks.json`,按 goal 里的调度算法执行:

1. 写状态文件 `<workspace>/.qualify/.current-phase`(内容:phase-{X}),让 Stop 钩子知道在执行
2. 读 tasks.json,找 status=pending 且 dependencies 都 completed 中 priority 最小的任务
3. 标记 in_progress,派子代理执行(子代理 prompt 按 goal.md 的【派子代理】段组装)
4. 子代理返回后更新 tasks.json
5. 循环直到全 completed 或全 blocked
6. 完成后:Stop 钩子会检测到,提示你敲 `/review {X}`

## ⚠️ 派子代理提示词提取规则(防 token 爆炸)

goal.md 有两层读者(详见 `templates/goal-prompt.md` 文件头)。派子代理时**只摘取子代理需要的段,跳过调度层专用段**:

**摘取(进子代理 prompt):**
- 【目标】【保护铁律】【完成条件】【工作目录】【可写范围】【只读参考】【关键约束】【绝对禁止】
- 当前任务的完整字段(id/module/problem/new_targets/acceptance_criteria/notes)

**跳过(标 `<!-- ORCHESTRATOR-ONLY -->` 的段,子代理是叶子不调度,塞进去是纯噪声):**
- 【调度算法】【派子代理】【每轮报告】【状态机】

**硬限制:派子代理提示词 ≤ 1500 字符。** 超了就压缩任务描述,不压缩铁律和完成条件。
单次任务的验证步骤 ≤ 5 个 node 命令调用(happy path + 1-2 个边界 + 1 个失败路径),禁止反复造数据验证。

$ARGUMENTS

**注**:执行层可能跑几小时。状态在 tasks.json(文件),不在上下文——这就是防腐化。
