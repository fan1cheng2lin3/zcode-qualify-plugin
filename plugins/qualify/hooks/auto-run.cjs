#!/usr/bin/env node
/**
 * /auto-run 调度脚本(确定性,不调大模型)。
 *
 * 管理 Phase 队列 + 重试 + gate + 夜间模式。
 * agent 按命令指令,每步调本脚本拿"下一步该干啥",执行完再调本脚本更新状态。
 *
 * 子命令:
 *   node auto-run.cjs init <phase1> <phase2> ... [--mode day|night] [--max-retries N]
 *     初始化队列,返回第一个该跑的 Phase
 *   node auto-run.cjs next
 *     读当前状态,返回"下一步该干啥"(quantify/run-goal/review/gate-wait/advance/finish)
 *   node auto-run.cjs review-done <pass|fail>
 *     评审完了,更新当前 Phase 的 result/attempts,返回下一步
 *   node auto-run.cjs gate-pass
 *     day 模式 gate:用户确认"继续",推进到下一个 Phase
 *   node auto-run.cjs status
 *     返回当前状态摘要(给飞书总结用)
 *
 * 状态文件:<workspace>/.qualify/.auto-run.json(格式见 auto-run-state.schema.md)
 */
"use strict";

const fs = require("fs");
const path = require("path");

function statePath(projectDir) {
  return path.join(projectDir, "workspace", ".qualify", ".auto-run.json");
}

function readState(projectDir) {
  const p = statePath(projectDir);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function writeState(projectDir, state) {
  const p = statePath(projectDir);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state, null, 2), "utf-8");
}

/** 输出 JSON 到 stdout(agent 读) */
function out(obj) {
  console.log(JSON.stringify(obj));
}

/** 初始化队列 */
function cmdInit(projectDir, args) {
  const phases = [];
  let mode = "day";
  let maxRetries = 3;
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--mode") { mode = args[++i]; continue; }
    if (a === "--max-retries") { maxRetries = parseInt(args[++i], 10); continue; }
    if (a === "--night") { mode = "night"; continue; }
    if (a === "--day") { mode = "day"; continue; }
    if (!a.startsWith("-")) phases.push(a);
  }
  if (phases.length === 0) {
    out({ error: "未指定 Phase。用法: auto-run.cjs init A B C [--mode day|night]" });
    process.exit(1);
  }
  const queue = phases.map((phase) => ({
    phase, status: "pending", attempts: 0, result: null, lastReviewAt: null,
  }));
  const state = {
    mode,
    startedAt: new Date().toISOString(),
    queue,
    currentPhase: phases[0],
    maxRetries,
    gatePassed: mode === "night",
    gateWaitingFor: null,
    summary: null,
    finishedAt: null,
  };
  writeState(projectDir, state);
  out({
    ok: true,
    action: "quantify",
    phase: phases[0],
    round: 1,
    reason: `队列初始化:${phases.join(" → ")}(mode=${mode},maxRetries=${maxRetries})`,
    queue: state.queue,
  });
}

/**
 * 自动扫描:读 docs/phases/phase-*.md 找所有 Phase,
 * 跟已有 .auto-run.json 对比,挑未完成的(completed 的跳过)进队列。
 * -n / --night → night 模式
 * 没有定性表的 Phase 不进队列(没定性表没法跑)。
 */
function cmdAuto(projectDir, args) {
  let mode = "day";
  for (const a of args) {
    if (a === "-n" || a === "--night") mode = "night";
    if (a === "--day") mode = "day";
  }

  // 1. 扫描 docs/phases/ 找所有 Phase
  const phasesDir = path.join(projectDir, "workspace", "docs", "phases");
  const allPhases = [];
  if (fs.existsSync(phasesDir)) {
    for (const f of fs.readdirSync(phasesDir)) {
      const m = f.match(/^phase-([A-Z0-9]+)\.md$/i);
      if (m) allPhases.push(m[1].toUpperCase());
    }
  }
  allPhases.sort();

  if (allPhases.length === 0) {
    out({ error: "未找到任何定性表(workspace/docs/phases/phase-*.md)。先跑 /qualify 建定性表。" });
    process.exit(1);
  }

  // 2. 读已有状态,挑已完成的
  const prevState = readState(projectDir);
  const doneSet = new Set();
  if (prevState && prevState.queue) {
    for (const q of prevState.queue) {
      if (q.status === "completed" && q.result === "pass") {
        doneSet.add(q.phase);
      }
    }
  }

  // 3. 过滤出未完成的
  const todo = allPhases.filter((p) => !doneSet.has(p));

  if (todo.length === 0) {
    out({ action: "finish", summary: `所有 ${allPhases.length} 个 Phase 都已完成,无可跑的。`, allPhases });
    return;
  }

  // 4. 复用 init 逻辑建队列
  const queue = todo.map((phase) => ({
    phase, status: "pending", attempts: 0, result: null, lastReviewAt: null,
  }));
  const state = {
    mode,
    startedAt: new Date().toISOString(),
    queue,
    currentPhase: todo[0],
    maxRetries: 3,
    gatePassed: mode === "night",
    gateWaitingFor: null,
    summary: null,
    finishedAt: null,
  };
  writeState(projectDir, state);
  out({
    ok: true,
    action: "quantify",
    phase: todo[0],
    round: 1,
    reason: `auto 扫描:共 ${allPhases.length} 个 Phase,已完成 ${doneSet.size},本次跑 ${todo.length} 个:${todo.join(" → ")}(mode=${mode})`,
    allPhases,
    todo,
    queue: state.queue,
  });
}

/** 读当前 Phase 的 tasks.json 是否存在(判断要不要 quantify) */
function tasksExist(projectDir, phase) {
  return fs.existsSync(path.join(projectDir, "workspace", ".qualify", phase, "tasks.json"));
}

/** 读 review 报告结论(判断过没过) */
function readReviewResult(projectDir, phase) {
  const reviewPath = path.join(projectDir, "workspace", "docs", "reviews", `phase-${phase}-review.md`);
  if (!fs.existsSync(reviewPath)) return null;
  const content = fs.readFileSync(reviewPath, "utf-8");
  const conclusionMatch = content.match(/##\s*结论[::]\s*(.+)/);
  if (!conclusionMatch) return null;
  const conclusion = conclusionMatch[1].trim();
  const isPass = /✅|通过/.test(conclusion) && !/❌|未通过/.test(conclusion);
  return { isPass, conclusion };
}

/** 判断下一步该干啥 */
function cmdNext(projectDir) {
  const state = readState(projectDir);
  if (!state) {
    out({ error: "auto-run 未初始化。先跑 auto-run.cjs init" });
    process.exit(1);
  }
  if (state.finishedAt) {
    out({ action: "finished", summary: state.summary });
    return;
  }

  const cur = state.queue.find((q) => q.phase === state.currentPhase);
  if (!cur) {
    out({ error: `currentPhase ${state.currentPhase} 不在队列` });
    process.exit(1);
  }

  // gate 等待中(day 模式)
  if (cur.status === "gate-waiting") {
    out({
      action: "gate-wait",
      phase: cur.phase,
      reason: `Phase ${cur.phase} 评审通过,day 模式等你确认进下一个。回复"继续"或跑 gate-pass`,
    });
    return;
  }

  // 已完成/失败 → 找下一个
  if (cur.status === "completed" || cur.status === "failed") {
    const next = state.queue.find((q) => q.status === "pending" || q.status === "in_progress");
    if (!next) {
      // 全跑完
      state.finishedAt = new Date().toISOString();
      const passed = state.queue.filter((q) => q.result === "pass").length;
      const failed = state.queue.filter((q) => q.result === "fail").length;
      const skipped = state.queue.filter((q) => q.result === "skipped").length;
      state.summary = `完成:${passed} 通过 / ${failed} 失败 / ${skipped} 跳过(共 ${state.queue.length} 个 Phase)`;
      writeState(projectDir, state);
      out({ action: "finish", summary: state.summary, queue: state.queue });
      return;
    }
    state.currentPhase = next.phase;
    writeState(projectDir, state);
    out({
      action: next.status === "in_progress" ? "retry-quantify" : "quantify",
      phase: next.phase,
      round: next.attempts + 1,
      reason: `进 Phase ${next.phase}(上一个 ${cur.phase} = ${cur.result})`,
    });
    return;
  }

  // 当前 Phase 在跑(in_progress):判断子步骤
  // 1. tasks.json 不存在 → quantify
  if (!tasksExist(projectDir, cur.phase)) {
    cur.status = "in_progress";
    writeState(projectDir, state);
    out({ action: "quantify", phase: cur.phase, round: cur.attempts + 1, reason: "tasks.json 不存在,先定量" });
    return;
  }
  // 2. tasks.json 存在,看有没有 review 报告
  const review = readReviewResult(projectDir, cur.phase);
  if (!review) {
    // 没 review → 要么还没跑执行,要么跑了没评审。判断 tasks 是否全 completed
    const tasksFile = path.join(projectDir, "workspace", ".qualify", cur.phase, "tasks.json");
    const tasks = JSON.parse(fs.readFileSync(tasksFile, "utf-8"));
    const allDone = tasks.tasks.every((t) => t.status === "completed" || t.status === "blocked" || t.status === "needs_human");
    if (allDone) {
      out({ action: "review", phase: cur.phase, reason: "执行层跑完,该评审了" });
    } else {
      out({ action: "run-goal", phase: cur.phase, reason: "tasks 未全完成,继续执行" });
    }
    return;
  }
  // 3. 有 review → 该 review-done 了(agent 应该已调 review-done,这里提醒)
  out({
    action: "review-done",
    phase: cur.phase,
    pass: review.isPass,
    reason: `评审报告已存在,结论:${review.conclusion}。调 review-done 更新状态`,
  });
}

/** 评审完了,更新状态 */
function cmdReviewDone(projectDir, args) {
  const pass = args[0] === "pass";
  const state = readState(projectDir);
  if (!state) { out({ error: "未初始化" }); process.exit(1); }

  const cur = state.queue.find((q) => q.phase === state.currentPhase);
  cur.lastReviewAt = new Date().toISOString();

  if (pass) {
    cur.status = state.mode === "night" ? "completed" : "gate-waiting";
    cur.result = "pass";
    state.gateWaitingFor = state.mode === "day" ? cur.phase : null;
    writeState(projectDir, state);
    out({
      action: state.mode === "night" ? "advance" : "gate-wait",
      phase: cur.phase,
      reason: state.mode === "night"
        ? `Phase ${cur.phase} 通过,夜间模式自动进下一个`
        : `Phase ${cur.phase} 通过,day 模式等你确认(回复"继续"或 gate-pass)`,
    });
  } else {
    cur.attempts++;
    if (cur.attempts >= state.maxRetries) {
      cur.status = "failed";
      cur.result = "fail";
      writeState(projectDir, state);
      out({
        action: "skip",
        phase: cur.phase,
        reason: `Phase ${cur.phase} 评审 ${cur.attempts} 次未过(达上限 ${state.maxRetries}),跳过。发飞书告警`,
        alert: true,
      });
    } else {
      cur.status = "in_progress";
      writeState(projectDir, state);
      out({
        action: "retry-quantify",
        phase: cur.phase,
        round: cur.attempts + 1,
        reason: `Phase ${cur.phase} 评审未过(第 ${cur.attempts}/${state.maxRetries} 次),带 review 报告重做定量`,
      });
    }
  }
}

/** day 模式 gate 通过 */
function cmdGatePass(projectDir) {
  const state = readState(projectDir);
  if (!state) { out({ error: "未初始化" }); process.exit(1); }
  const cur = state.queue.find((q) => q.phase === state.currentPhase);
  if (cur.status === "gate-waiting") {
    cur.status = "completed";
    state.gateWaitingFor = null;
    state.gatePassed = true;
    writeState(projectDir, state);
    out({ action: "advance", phase: cur.phase, reason: `gate 通过,进下一个` });
  } else {
    out({ action: "noop", reason: `当前不在 gate-waiting(状态:${cur.status})` });
  }
}

/** 状态摘要 */
function cmdStatus(projectDir) {
  const state = readState(projectDir);
  if (!state) { out({ error: "未初始化" }); process.exit(1); }
  out({
    mode: state.mode,
    currentPhase: state.currentPhase,
    gateWaitingFor: state.gateWaitingFor,
    finished: !!state.finishedAt,
    summary: state.summary,
    queue: state.queue.map((q) => ({ phase: q.phase, status: q.status, attempts: q.attempts, result: q.result })),
  });
}

function main() {
  const projectDir = process.env.ZCODE_PROJECT_DIR || process.cwd();
  const [subcmd, ...args] = process.argv.slice(2);

  switch (subcmd) {
    case "init": cmdInit(projectDir, args); break;
    case "auto": cmdAuto(projectDir, args); break;
    case "next": cmdNext(projectDir); break;
    case "review-done": cmdReviewDone(projectDir, args); break;
    case "gate-pass": cmdGatePass(projectDir); break;
    case "status": cmdStatus(projectDir); break;
    default:
      out({ error: `未知子命令: ${subcmd}。可用: init/auto/next/review-done/gate-pass/status` });
      process.exit(1);
  }
}

main();
