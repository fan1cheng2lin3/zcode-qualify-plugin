#!/usr/bin/env node
/**
 * 飞书任务同步:读 auto-run 状态 + review 报告,同步到飞书任务。
 *
 * 每个 Phase 一个飞书任务。状态跟着 auto-run 走:
 *   - 跑中 → 任务 in_progress,描述更新进度
 *   - 通过 → 任务标完成
 *   - 失败/卡住 → 任务描述标"卡住",不发完成(让你看到异常)
 *
 * 配置(notify.local.json):
 *   {
 *     "lark": { "targetType":"user", "targetId":"ou_xxx", "larkCliPath":"lark-cli" },
 *     "sync": { "taskMap": { "A": "guid-xxx" } }  // Phase → 任务 guid
 *   }
 *
 * 子命令:
 *   node sync-feishu.cjs sync    读 .auto-run.json + review,同步任务状态
 *   node sync-feishu.cjs status  打印当前同步配置
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

// ===== 工具函数 =====

function findConfig(projectDir, pluginRoot) {
  const candidates = [
    path.join(projectDir, "workspace", ".qualify", "notify.local.json"),
    pluginRoot ? path.join(pluginRoot, "hooks", "notify.local.json") : null,
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(c, "utf-8"));
        if (cfg.lark && cfg.lark.targetId) return { cfg, path: c };
      } catch {}
    }
  }
  return null;
}

function resolveLarkCli(cfg) {
  const cliName = (cfg && cfg.lark && cfg.lark.larkCliPath) || "lark-cli";
  if (cliName.endsWith(".js") && fs.existsSync(cliName)) {
    return { command: "node", prefix: [cliName] };
  }
  if (process.platform === "win32") {
    const pathDirs = (process.env.PATH || "").split(path.delimiter);
    for (const dir of pathDirs) {
      const cmdFile = path.join(dir, cliName + ".cmd");
      if (fs.existsSync(cmdFile)) {
        try {
          const cmdContent = fs.readFileSync(cmdFile, "utf-8");
          const m = cmdContent.match(/(node_modules[\\\/][^\s"]+run\.js)/);
          if (m) {
            const runJs = path.join(path.dirname(cmdFile), m[1]);
            if (fs.existsSync(runJs)) return { command: "node", prefix: [runJs] };
          }
        } catch {}
      }
    }
    return { command: cliName + ".cmd", prefix: [], useShell: true };
  }
  return { command: cliName, prefix: [] };
}

function callLark(cfg, args) {
  const { command, prefix, useShell } = resolveLarkCli(cfg);
  try {
    const output = execFileSync(command, [...prefix, ...args], {
      encoding: "utf-8", timeout: 20000,
      stdio: ["pipe", "pipe", "pipe"], shell: useShell === true,
    });
    return JSON.parse(output);
  } catch (e) {
    console.error(`[sync] lark-cli 调用失败: ${e.message}`);
    if (e.stderr) console.error(`[sync] stderr: ${e.stderr.toString().slice(0, 200)}`);
    return null;
  }
}

function readAutoRunState(projectDir) {
  const p = path.join(projectDir, "workspace", ".qualify", ".auto-run.json");
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function readReviewStats(projectDir, phase) {
  const reviewPath = path.join(projectDir, "workspace", "docs", "reviews", `phase-${phase}-review.md`);
  if (!fs.existsSync(reviewPath)) return { passCount: 0, failCount: 0, conclusion: "" };
  const content = fs.readFileSync(reviewPath, "utf-8");
  const passCount = (content.match(/\|\s*✅\s*\|/g) || []).length;
  const failCount = (content.match(/\|\s*❌\s*\|/g) || []).length;
  const cm = content.match(/##\s*结论[::]\s*(.+)/);
  const conclusion = cm ? cm[1].trim() : "";
  return { passCount, failCount, conclusion };
}

function readTasksCount(projectDir, phase) {
  const tasksFile = path.join(projectDir, "workspace", ".qualify", phase, "tasks.json");
  if (!fs.existsSync(tasksFile)) return { total: 0, completed: 0 };
  try {
    const d = JSON.parse(fs.readFileSync(tasksFile, "utf-8"));
    const tasks = d.tasks || [];
    return {
      total: tasks.length,
      completed: tasks.filter((t) => t.status === "completed").length,
    };
  } catch { return { total: 0, completed: 0 }; }
}

// 状态映射:auto-run status → 任务状态 + 描述文案
function mapTaskState(state, entry, tasks, review) {
  const s = entry.status;
  const icon = s === "completed" && entry.result === "pass" ? "✅" :
               s === "failed" ? "❌" :
               entry.attempts >= (state.maxRetries || 3) ? "⚠️" : "🔄";
  let desc;
  if (s === "completed" && entry.result === "pass") {
    desc = `${icon} Phase ${entry.phase} 通过\n评审: ${review.conclusion || "✅ 通过"}\n完成条件: ✅${review.passCount} ❌${review.failCount}\n任务: ${tasks.completed}/${tasks.total} 完成`;
    return { completed: true, desc };
  }
  if (s === "failed") {
    desc = `${icon} Phase ${entry.phase} 失败(达重试上限 ${entry.attempts}/${state.maxRetries})\n最后评审: ${review.conclusion || "未通过"}\n需人工介入`;
    return { completed: false, desc };
  }
  // in_progress / pending / gate-waiting
  const stage = tasks.total === 0 ? "待定量" : tasks.completed < tasks.total ? `执行中(${tasks.completed}/${tasks.total})` : "待评审";
  desc = `${icon} Phase ${entry.phase} ${stage}\n重试: ${entry.attempts}/${state.maxRetries}\n任务: ${tasks.completed}/${tasks.total}`;
  return { completed: false, desc };
}

// ===== cmdSync =====

function cmdSync(projectDir, cfg, cfgPath) {
  const state = readAutoRunState(projectDir);
  if (!state) {
    console.error("[sync] .auto-run.json 不存在,先跑 auto-run init");
    process.exit(1);
  }
  const syncCfg = (cfg.sync || {});
  const taskMap = syncCfg.taskMap || {};
  const myId = cfg.lark.targetId;

  const results = [];
  for (const entry of state.queue) {
    const phase = entry.phase;
    const tasks = readTasksCount(projectDir, phase);
    const review = readReviewStats(projectDir, phase);
    const mapped = mapTaskState(state, entry, tasks, review);

    // 建任务(首次)或更新描述
    if (!taskMap[phase]) {
      const resp = callLark(cfg, [
        "task", "+create",
        "--summary", `Phase ${phase}`,
        "--description", mapped.desc,
        "--assignee", myId,
      ]);
      if (resp && resp.ok) {
        taskMap[phase] = resp.data.guid;
      }
    } else {
      // 更新描述(任务进度)
      callLark(cfg, ["task", "+update", "--task-id", taskMap[phase], "--description", mapped.desc]);
      // 标完成(通过时)
      if (mapped.completed) {
        callLark(cfg, ["task", "+complete", "--task-id", taskMap[phase]]);
      }
    }

    results.push({ phase, taskGuid: taskMap[phase] ? "已同步" : "失败", completed: mapped.completed });
  }

  // 回写 taskMap 到配置
  syncCfg.taskMap = taskMap;
  if (cfgPath && fs.existsSync(cfgPath)) {
    const full = JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
    full.sync = syncCfg;
    fs.writeFileSync(cfgPath, JSON.stringify(full, null, 2), "utf-8");
  }

  console.log(JSON.stringify({ ok: true, synced: results.length, results }, null, 2));
}

// ===== 主入口 =====

function main() {
  const projectDir = process.env.ZCODE_PROJECT_DIR || process.cwd();
  const pluginRoot = process.env.ZCODE_PLUGIN_ROOT;
  const [subcmd, ...args] = process.argv.slice(2);

  if (subcmd === "sync") {
    const found = findConfig(projectDir, pluginRoot);
    if (!found) { console.error("未配 lark target"); process.exit(1); }
    cmdSync(projectDir, found.cfg, found.path);
    return;
  }
  if (subcmd === "status") {
    const found = findConfig(projectDir, pluginRoot);
    console.log(JSON.stringify({ lark: found?.cfg?.lark, sync: found?.cfg?.sync }, null, 2));
    return;
  }
  console.error("用法: sync-feishu.cjs sync | status");
  process.exit(1);
}

main();
