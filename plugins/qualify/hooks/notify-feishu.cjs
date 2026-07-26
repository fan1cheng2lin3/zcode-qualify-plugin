#!/usr/bin/env node
/**
 * 飞书通知钩子(改用 lark-cli,弃用 webhook)。
 *
 * 触发:PostToolUse(Write/Edit 写 review 报告后)或手动调。
 * 读评审报告结论 + 统计,格式化成 markdown,调 lark-cli im +messages-send 发送。
 *
 * 配置查找顺序(找到第一个用):
 *   1. <项目根>/workspace/.qualify/notify.local.json(项目级,优先)
 *   2. <插件根>/hooks/notify.local.json(插件默认)
 *
 * 配置格式:
 *   {
 *     "lark": {
 *       "targetType": "user",           // user | chat
 *       "targetId": "ou_xxx",           // open_id(user) 或 chat_id(chat)
 *       "larkCliPath": "lark-cli"       // 可选,默认从 PATH 找
 *     }
 *   }
 *
 * 没配 targetId → 写本地日志 fallback,不报错。
 *
 * 用法(手动测):
 *   node notify-feishu.cjs <评审报告路径>
 *   node notify-feishu.cjs workspace/docs/reviews/phase-A-review.md
 *
 * PostToolUse 钩子模式(从 stdin 读工具调用详情,提取文件路径):
 *   stdin 传 ZCode 钩子 JSON,脚本判断是否 review 报告,是则发通知。
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

/**
 * 找通知配置文件(项目级优先,插件级 fallback)
 */
function findNotifyConfig(projectDir, pluginRoot) {
  const candidates = [
    path.join(projectDir, "workspace", ".qualify", "notify.local.json"),
    pluginRoot ? path.join(pluginRoot, "hooks", "notify.local.json") : null,
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(c, "utf-8"));
        if (cfg.lark && cfg.lark.targetId && !cfg.lark.targetId.startsWith("填")) {
          return cfg;
        }
      } catch {}
    }
  }
  return null;
}

/**
 * 从评审报告 markdown 提取结论 + 统计
 */
function parseReviewReport(reportPath) {
  if (!fs.existsSync(reportPath)) return null;
  const content = fs.readFileSync(reportPath, "utf-8");

  const conclusionMatch = content.match(/##\s*结论[::]\s*(.+)/);
  const conclusion = conclusionMatch ? conclusionMatch[1].trim() : "未知";

  const isPass = /✅|通过/.test(conclusion) && !/❌|未通过/.test(conclusion);
  const isFail = /❌|未通过/.test(conclusion);

  const phaseMatch = content.match(/Phase\s+([A-Z0-9]+)/i);
  const phase = phaseMatch ? phaseMatch[1] : "?";

  const passCount = (content.match(/\|\s*✅\s*\|/g) || []).length;
  const failCount = (content.match(/\|\s*❌\s*\|/g) || []).length;

  const failedItems = [];
  const failSection = content.match(/##\s*没做到位的[\s\S]*?(?=##\s|$)/);
  if (failSection) {
    const items = failSection[0].match(/###\s*(.+)/g) || [];
    for (const it of items.slice(0, 3)) {
      failedItems.push(it.replace(/^###\s*/, "").trim());
    }
  }

  return { phase, conclusion, isPass, isFail, passCount, failCount, failedItems };
}

/**
 * 构造飞书 markdown 消息
 */
function buildMessage(review) {
  const { phase, conclusion, isPass, passCount, failCount, failedItems } = review;
  const icon = isPass ? "✅" : "❌";
  const title = isPass ? `${icon} Phase ${phase} 评审通过` : `${icon} Phase ${phase} 评审未通过`;

  let msg = `${title}\n\n`;
  msg += `**结论:** ${conclusion}\n`;
  msg += `**完成条件:** ✅ ${passCount} 通过 / ❌ ${failCount} 未通过\n`;

  if (!isPass && failedItems.length > 0) {
    msg += `\n**没做到位:**\n`;
    for (const f of failedItems) msg += `- ${f}\n`;
    msg += `\n_已自动触发下一轮定量,针对上述未通过项重做_\n`;
  } else if (isPass) {
    msg += `\n_Phase ${phase} 完成,可进下一个 Phase_\n`;
  }

  return msg;
}

/**
 * 解析 lark-cli 的真实调用方式(处理 Windows 扩展名 + 换行参数问题)。
 *
 * 问题:Windows 上 npm 装的 lark-cli 是 .cmd shim,它调 node run.js。
 * node 的 execFileSync 调 .cmd 需要 shell:true,但 shell 会把 markdown 换行拆成多个参数。
 * 解法:绕过 .cmd,直接用 node 调 run.js(从 .cmd 内容里解析出 run.js 路径)。
 *
 * 返回 { command, args } —— command 是 "node",args 前缀是 [run.js 路径]
 */
function resolveLarkCli(cfg) {
  const cliName = cfg.lark.larkCliPath || "lark-cli";

  // 如果配的是完整 .js 路径,直接用 node 调
  if (cliName.endsWith(".js") && fs.existsSync(cliName)) {
    return { command: "node", prefix: [cliName] };
  }

  // Windows:从 PATH 找 lark-cli.cmd,解析它调的 run.js
  if (process.platform === "win32") {
    const pathDirs = (process.env.PATH || "").split(path.delimiter);
    for (const dir of pathDirs) {
      const cmdFile = path.join(dir, cliName + ".cmd");
      if (fs.existsSync(cmdFile)) {
        try {
          const cmdContent = fs.readFileSync(cmdFile, "utf-8");
          // .cmd 里有形如:"%dp0%\node_modules\@larksuite\cli\scripts\run.js"
          const m = cmdContent.match(/(node_modules[\\\/][^\s"]+run\.js)/);
          if (m) {
            const dp0 = path.dirname(cmdFile);
            const runJs = path.join(dp0, m[1]);
            if (fs.existsSync(runJs)) {
              return { command: "node", prefix: [runJs] };
            }
          }
        } catch {}
      }
    }
    // fallback:直接用 .cmd(可能换行有问题,但至少能跑单行消息)
    return { command: cliName + ".cmd", prefix: [], useShell: true };
  }

  // 非 Windows:直接用名字
  return { command: cliName, prefix: [] };
}

/**
 * 调 lark-cli 发消息
 */
function sendViaLarkCli(cfg, message) {
  const { command, prefix, useShell } = resolveLarkCli(cfg);
  const targetType = cfg.lark.targetType === "chat" ? "--chat-id" : "--user-id";
  const targetId = cfg.lark.targetId;

  const args = [
    ...prefix,
    "im", "+messages-send",
    targetType, targetId,
    "--markdown", message,
  ];

  try {
    const output = execFileSync(command, args, {
      encoding: "utf-8",
      timeout: 15000,
      stdio: ["pipe", "pipe", "pipe"],
      shell: useShell === true,
    });
    const resp = JSON.parse(output);
    if (resp.ok) {
      console.error(`[notify] ✅ lark-cli 发送成功: message_id=${resp.data?.message_id || "?"}`);
      return true;
    } else {
      console.error(`[notify] lark-cli 返回异常: ${output.slice(0, 200)}`);
      return false;
    }
  } catch (e) {
    console.error(`[notify] lark-cli 调用失败: ${e.message}`);
    if (e.stderr) console.error(`[notify] stderr: ${e.stderr.toString().slice(0, 200)}`);
    return false;
  }
}

/**
 * 写本地日志 fallback(没配 lark target 或发送失败时)
 */
function writeFallbackLog(projectDir, review) {
  const logLine = `[${new Date().toISOString()}] Phase ${review.phase} | ${review.conclusion} | ✅${review.passCount} ❌${review.failCount}\n`;
  const logPath = path.join(projectDir, "workspace", ".qualify", "notify-fallback.log");
  try {
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
    fs.appendFileSync(logPath, logLine);
    console.error(`[notify] fallback 写本地日志: ${logPath}`);
  } catch (e) {
    console.error(`[notify] 本地日志也写不了: ${e.message}`);
  }
}

/**
 * 从 PostToolUse stdin JSON 提取被写文件路径。
 * 只关心写到 *-review.md 的文件,其他静默跳过。
 */
function readReportPathFromStdin() {
  try {
    const raw = fs.readFileSync(0, "utf-8");
    const data = JSON.parse(raw);
    const filePath =
      data?.tool_input?.file_path ||
      data?.tool_input?.filePath ||
      data?.input?.file_path ||
      data?.tool_input?.path ||
      null;
    if (!filePath) return null;
    if (!/-review\.md$/.test(filePath) && !/reviews[\/\\]phase-/i.test(filePath)) {
      return null;
    }
    return filePath;
  } catch {
    return null;
  }
}

async function main() {
  let reportPath = process.argv[2];
  if (!reportPath) {
    reportPath = readReportPathFromStdin();
    if (!reportPath) {
      process.exit(0);
    }
  }

  const projectDir = process.env.ZCODE_PROJECT_DIR || process.cwd();
  const pluginRoot = process.env.ZCODE_PLUGIN_ROOT;
  const cfg = findNotifyConfig(projectDir, pluginRoot);

  const review = parseReviewReport(reportPath);
  if (!review) {
    console.error(`[notify] 评审报告不存在或无法解析: ${reportPath}`);
    process.exit(0);
  }

  // 没配 lark target → fallback
  if (!cfg) {
    writeFallbackLog(projectDir, review);
    process.exit(0);
  }

  // 调 lark-cli 发送
  const message = buildMessage(review);
  const ok = sendViaLarkCli(cfg, message);
  if (!ok) {
    // 发送失败也写 fallback 日志(留痕)
    writeFallbackLog(projectDir, review);
  }
  process.exit(0);
}

main();
