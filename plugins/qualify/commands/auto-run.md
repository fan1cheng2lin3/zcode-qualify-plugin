---
description: 自动跑 — 扫描所有未完成 Phase,串行跑完。夜间模式(-n)可无人值守。
argument-hint: "[-n|--night]"
---

自动扫描 `workspace/docs/phases/` 里所有未完成的 Phase,串行跑完(quantify→run-goal→review 循环)。已完成的跳过,不用手写 Phase 列表。

$ARGUMENTS

## 模式

- **默认(day)**:Phase 之间停下问你("Phase X 完成,继续?")。防错误传播。
- **-n 或 --night**:Phase 之间自动通过,不问你。适合睡觉时跑。配合飞书通知。

## 调度逻辑(按这个循环跑)

你(agent)按以下步骤循环,每步调调度脚本 `auto-run.cjs` 拿指令:

### 第 0 步:自动扫描 + 初始化队列

```
node <插件根>/hooks/auto-run.cjs auto -n        # -n 夜间模式,不加就是 day
```

读返回的 `action` 字段,按它干。若返回 `action: finish`(全部完成),告诉用户"没有未完成的 Phase"。

### 主循环

反复跑下面的"问脚本 → 执行 → 报告",直到脚本返回 `action: finish`:

```
node <插件根>/hooks/auto-run.cjs next
```

读返回的 `action`,分支处理:

### 主循环

反复跑下面的"问脚本 → 执行 → 报告",直到脚本返回 `action: finish`:

```
node <插件根>/hooks/auto-run.cjs next
```

读返回的 `action`,分支处理:

- **action: quantify** → 跑 `/quantify {phase}`(生成 tasks.json + goal.md)
- **action: retry-quantify** → 跑 `/quantify {phase}`,但**读上一轮评审报告** `docs/reviews/phase-{X}-review.md` 的"下一轮指令"段,针对未通过项重做
- **action: run-goal** → 跑 `/run-goal {phase}`(执行层跑任务)
- **action: review** → 跑 `/review {phase}`(评审,会触发飞书通知)
- **action: review-done** → 评审报告已存在,读它的结论,调 `review-done pass|fail`:
  ```
  node auto-run.cjs review-done pass   # 评审通过
  node auto-run.cjs review-done fail   # 评审未通过
  ```
  **评审完后立刻同步飞书任务**(更新任务状态/描述):
  ```
  node <插件根>/hooks/sync-feishu.cjs sync
  ```
- **action: gate-wait**(day 模式)→ 停下,告诉用户:"Phase {X} 评审通过,继续下一个?回复'继续'"。用户确认后跑:
  ```
  node auto-run.cjs gate-pass
  ```
- **action: skip** → Phase 卡住(达重试上限),脚本会标 `alert: true`。**发飞书告警 + 同步任务**:
  ```
  lark-cli im +messages-send --user-id {你的id} --markdown "⚠️ Phase {X} 卡住,{N} 次未过,已跳过"
  node <插件根>/hooks/sync-feishu.cjs sync
  ```
  然后继续 `next`(脚本会自动进下一个 Phase)
- **action: advance** → 自动进下一个 Phase,继续 `next`
- **action: finish** → 全跑完。**同步任务 + 发飞书总结**:
  ```
  node <插件根>/hooks/sync-feishu.cjs sync
  lark-cli im +messages-send --user-id {你的id} --markdown "🏁 auto-run 完成: {summary}"
  ```
  告诉用户结果,结束。

### 重试上限(防无限循环)

- 同一个 Phase 评审不过,最多重试 `maxRetries` 次(默认 3)
- 达上限 → 标 failed,跳过,进下一个 Phase
- 不会无限循环卡死

## 防护(不可违反)

1. **保护铁律仍在** — 执行层(/run-goal)还是受定性表槽 2 的只读约束,不能碰 v2/v3 基线
2. **重试上限硬上限** — maxRetries 达到必跳过,不卡死
3. **飞书通知每步** — 评审完自动发(钩子),卡住/完成也发
4. **状态在文件** — `.auto-run.json` 是唯一状态源,不靠上下文记进度(防腐化)

## 夜间模式注意

- ZCode session 必须保持运行(不能关电脑/ZCode)
- 电脑不能睡眠(改电源设置,或计划任务定时唤醒)
- 每步评审完飞书通知你,早上看飞书就知道跑成啥样

## 查状态(随时)

```
node <插件根>/hooks/auto-run.cjs status
```

返回当前进度、每个 Phase 的状态、gate 等待等。
