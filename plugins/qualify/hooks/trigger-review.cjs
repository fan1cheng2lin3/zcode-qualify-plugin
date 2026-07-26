#!/usr/bin/env node
/**
 * Stop 钩子:执行层跑完后,若有活跃 Phase,提示触发 /review。
 *
 * 不自动启动 /review(避免无限循环 + 误触发正常对话),
 * 而是在 additionalContext 里提示"执行层似乎跑完了,建议敲 /review phase-{X}"。
 * 由人决定是否真的评审——保留控制权,防跑飞。
 *
 * 判断"是否在执行 Phase":
 *   读 <workspace>/.qualify/phase-{X}/tasks.json,若有 status=in_progress 的任务,
 *   说明刚执行过。状态文件 <workspace>/.qualify/.current-phase 记录当前 Phase。
 *
 * 输出:ZCode 钩子 JSON(additionalContext)。无活跃 Phase 时静默通过。
 */
"use strict";

const fs = require("fs");
const path = require("path");

function main() {
  const projectDir = process.env.ZCODE_PROJECT_DIR || process.cwd();
  const workspaceDir = path.join(projectDir, "workspace");
  const stateFile = path.join(workspaceDir, ".qualify", ".current-phase");

  // 无状态文件 = 没在执行任何 Phase,静默通过
  if (!fs.existsSync(stateFile)) {
    process.exit(0);
  }

  const phase = fs.readFileSync(stateFile, "utf-8").trim();
  if (!phase) {
    process.exit(0);
  }

  // 检查该 Phase 的 tasks.json 是否还有 in_progress(说明刚执行过)
  const tasksFile = path.join(workspaceDir, ".qualify", phase, "tasks.json");
  if (!fs.existsSync(tasksFile)) {
    process.exit(0);
  }

  const tasks = JSON.parse(fs.readFileSync(tasksFile, "utf-8"));
  const inProgress = (tasks.tasks || []).filter(t => t.status === "in_progress");
  const completed = (tasks.tasks || []).filter(t => t.status === "completed").length;
  const total = (tasks.stats && tasks.stats.total) || (tasks.tasks || []).length;

  // 没有 in_progress 任务 = 执行层跑完了(全 completed 或全 blocked)
  if (inProgress.length === 0 && completed < total) {
    // 全 blocked 了,提示人工介入
    console.log(JSON.stringify({
      additionalContext: `## 执行层状态:Phase ${phase} 全部 blocked\n\n建议检查 .qualify/${phase}/tasks.json,处理 needs_human/blocked 任务后重跑。`
    }));
    process.exit(0);
  }

  if (completed >= total) {
    // 全完成了,清状态文件 + 提示评审
    fs.unlinkSync(stateFile);
    console.log(JSON.stringify({
      additionalContext: `## 执行层完成:Phase ${phase}(${completed}/${total} 任务)\n\n建议敲 \`/review ${phase}\` 评审。若通过,Phase ${phase} 结束。`
    }));
    process.exit(0);
  }

  // 还有 in_progress,说明是中间停下,不提示评审
  process.exit(0);
}

main();
