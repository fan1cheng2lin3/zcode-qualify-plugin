---
name: quantify
description: 定量阶段。读定性填空表(7 槽) + 项目档案 + 规矩库,渲染出 tasks.json + goal 提示词。这是"goal 提示词写作专家"——不是模板拼接,是理解材料后自己组织语言写出优秀 goal。详见 goal-prompt-writing-guide。
---

# Quantify Skill — 定量渲染

> 你是 **goal 提示词写作专家**。读定性材料,理解后写出一份精准的 goal 提示词 + tasks.json。
> 不是模板填空,是创作——但创作有约束(8 段结构、5 大陷阱、字符上限)。

## 输入(读这四样)

1. **定性填空表** `<workspace>/docs/phases/phase-{X}.md` — 7 个槽(What/Scope/Alternatives/New Constraints/Tasks/Done When/Impact)
2. **项目档案** `<workspace>/project.profile.md` — 技术栈 + 流程骨架(段 5/6/7/8 抄这里)+ 十大类标签定义
3. **规矩库** `<workspace>/docs/constraints/*.md` — 按 Phase 涉及的大类过滤,只取 `status: active` 的
4. **上一轮评审报告**(若有) `<workspace>/docs/reviews/phase-{X}-review.md` — 读"下一轮指令"段,针对未通过项调整

## 思考(先想后写,落盘写作计划)

读完后,**先写一份写作计划**(落盘到 `<workspace>/.qualify/phase-{X}/writing-plan.md`),回答:

- 槽 5(完成条件)哪几条进 goal?要不要补执行层会踩坑的?(参考 goal-prompt-writing-guide 的"5 大陷阱")
- 保护边界(槽 2)怎么表达最清楚?
- 任务拆解(槽 4)有没有漏依赖?谁该先做?
- 定性没考虑到、但执行层一定遇到的问题是什么?(补进 goal 的【关键约束】)
- goal 的 8 段里,哪些段详细写、哪些简略?

**写作计划落盘 = 可观测**。你能看到模型想了啥,微调时改计划而非瞎改 goal。

## 落笔(确定性渲染,按结构)

拿写作计划,按以下结构渲染两个文件:

### 文件 1:`tasks.json`(机器可读,子代理读字段干活)

字段固定(参考 `templates/tasks.json` 骨架):
- 槽 4 → `tasks[]` 数组(每个任务:id/module/priority/dependencies/problem/old_references/new_targets/acceptance_criteria/improvements/notes)
- 槽 5 → 每个任务的 `acceptance_criteria`(按任务关联切分)
- 槽 3.5 → `global_rules.new_constraints_to_register`(待工具自动入库)
- 项目档案技术栈 → `global_rules` 核心字段
- 槽 2 只读 → `global_rules.strictly_forbidden_paths`
- 规矩库注入 → `source_paths.constraints_injected`
- 执行态字段(status/assigned_at)→ 留空/默认 pending

### 文件 2:`goal.md`(人可读,≤ 4000 字符)

8 段结构(参考 `templates/goal-prompt.md` + goal-prompt-writing-guide 第 7 节):
- 段 1 目标:来自槽 1(What)
- 段 2 保护边界:来自槽 2(Scope 只读部分)
- 段 3 完成条件:来自槽 5(Done When)+ 通用条件(build/test/行数)
- 段 4 工作目录+可写:来自槽 2(Scope 可写部分)+ 项目档案
- **段 5/6/7/8(调度/派子代理/报告/状态机):抄 project.profile.md 的流程骨架,不重新发明**
- 【关键约束】:规矩库注入的相关规矩 + 槽 3.5 新规矩
- 【绝对禁止】:槽 2 只读 + 项目级 forbidden_actions

## 渲染规则(防腐化铁律)

1. **段 5/6/7/8 从项目档案抄,不从定性表发挥** — 这些是项目级常量,所有 Phase 一样
2. **槽 3(候选方案)/槽 6(受影响面)不进定量产物** — 它们是定性"防错槽",不驱动执行
3. **槽 3.5 抽出来** — 进 `new_constraints_to_register`(待入库),不混进 tasks
4. **goal.md ≤ 4000 字符** — 详细规则放 tasks.json,goal 只放调度逻辑
5. **完成条件必须可验证** — grep/文件存在/测试通过,禁"感觉差不多了"

## 输出

```
<workspace>/.qualify/phase-{X}/
├── writing-plan.md    ← 思考过程(可观测)
├── tasks.json         ← 任务清单(机器可读)
└── goal.md            ← goal 提示词(人可读,≤ 4000 字符)
```

## 完成后

告诉用户:
- 生成了哪几个文件
- tasks.json 有几个任务、依赖关系概览
- goal.md 字符数(确认 < 4000)
- 下一步:敲 `/run-goal phase-{X}` 启动执行,或人工审查 writing-plan.md
