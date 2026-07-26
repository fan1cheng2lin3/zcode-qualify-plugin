# /auto-run 状态文件格式

> 存在 `<workspace>/.qualify/.auto-run.json`。auto-run 调度脚本读写它,agent 按它决定下一步。
> 这是 auto-run 的"大脑"——所有循环/重试/gate 状态都在这里。

```json
{
  "mode": "night",
  "startedAt": "2026-07-26T21:00:00+08:00",
  "queue": [
    { "phase": "A", "status": "completed", "attempts": 1, "result": "pass", "lastReviewAt": "..." },
    { "phase": "B", "status": "in_progress", "attempts": 2, "result": null, "lastReviewAt": null },
    { "phase": "C", "status": "pending", "attempts": 0, "result": null, "lastReviewAt": null }
  ],
  "currentPhase": "B",
  "maxRetries": 3,
  "gatePassed": true,
  "gateWaitingFor": null,
  "summary": null,
  "finishedAt": null
}
```

## 字段

- **mode**: `day`(Phase 间停下问你) | `night`(Phase 间自动通过)
- **queue**: Phase 队列,每个 Phase 一个条目
  - **status**: `pending`(没开始) | `in_progress`(在跑) | `completed`(过了) | `failed`(卡住/放弃) | `gate-waiting`(等你确认)
  - **attempts**: 同 Phase 重试次数(评审没过回定量的次数)
  - **result**: `pass` | `fail` | `skipped` | null(还没评)
- **currentPhase**: 当前在跑哪个 Phase
- **maxRetries**: 同 Phase 评审不过最多重试几次(默认 3)
- **gatePassed / gateWaitingFor**: day 模式下,Phase 间 gate 的状态
- **summary / finishedAt**: 全跑完后填

## 状态转移(agent 按这个走)

```
启动 auto-run A B C:
  queue 全 pending, currentPhase=A
  ↓
跑 currentPhase:
  1. /quantify {phase}(若 tasks.json 不存在或 review 说要重做)
  2. /run-goal {phase}
  3. /review {phase} → 写 review 报告(触发飞书通知)
  4. 读 review 结论:
     - 通过:
        day 模式 → status=gate-waiting, 停下问"Phase X 完成,继续?"
        night 模式 → status=completed, 直接进下一个
     - 没通过:
        attempts++
        attempts < maxRetries → 回 step 1(带 review 的"下一轮指令")
        attempts >= maxRetries → status=failed, 发飞书告警, 跳过, 进下一个
  ↓
进下一个 Phase:
  day 模式 → 停在 gate, 等你回复"继续"
  night 模式 → 自动继续
  ↓
queue 全 completed/failed → 写 summary, 发飞书总结, finishedAt 填, 结束
```
