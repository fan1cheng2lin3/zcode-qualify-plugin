#!/usr/bin/env node
/**
 * SessionStart 钩子:按标签从规矩库抽相关规矩,注入 additionalContext。
 *
 * 防看漏老规矩的真正机制——不是人去翻文档(会漏),是工具按标签自动筛推。
 * 粗粒度十大类(money/architecture/cache/...),宁可多抽几张(噪音可剔),不可漏抽一条(违反铁律不可恢复)。
 *
 * 输出:ZCode 钩子 JSON schema(additionalContext 字段),注入到新 session 上下文。
 * 规矩库为空时输出空 additionalContext,不报错。
 *
 * 环境变量(由 ZCode 钩子运行器注入):
 *   ZCODE_PROJECT_DIR — 项目根目录
 *   ZCODE_PLUGIN_ROOT — 插件根目录(本文件所在插件的根)
 */
"use strict";

const fs = require("fs");
const path = require("path");

// 十大类固定标签(与 project.profile.md / CONTEXT.md 一致)
const VALID_TAGS = [
  "money", "architecture", "cache", "testing", "security",
  "naming", "database", "frontend", "persistence", "other"
];

/**
 * 读规矩库所有 active 规矩,返回 {tag, title, rule}[]
 * 规矩文件格式见 templates/constraint.md(yaml frontmatter + 规矩正文)
 */
function loadActiveConstraints(constraintsDir) {
  if (!fs.existsSync(constraintsDir)) return [];
  const files = fs.readdirSync(constraintsDir).filter(f => f.endsWith(".md") && f !== "README.md");
  const constraints = [];
  for (const f of files) {
    const full = path.join(constraintsDir, f);
    const content = fs.readFileSync(full, "utf-8");
    // 解析 yaml frontmatter(简易,不引 js-yaml 依赖)
    const m = content.match(/^# (\d+)\s*-\s*(.+)\n+```yaml\n([\s\S]*?)```/);
    if (!m) continue;
    const num = m[1], title = m[2].trim(), yamlBlock = m[3];
    const tag = (yamlBlock.match(/tag:\s*(\S+)/) || [])[1];
    const status = (yamlBlock.match(/status:\s*(\S+)/) || [])[1];
    if (status !== "active") continue; // 跳过 superseded
    if (!VALID_TAGS.includes(tag)) continue; // 标签非法跳过
    // 提取"## 规矩"段正文(一句话铁律)
    const ruleMatch = content.match(/## 规矩\n\n([\s\S]*?)(?:\n## |\n$|$)/);
    const ruleText = ruleMatch ? ruleMatch[1].trim() : "";
    constraints.push({ num, title, tag, rule: ruleText });
  }
  return constraints;
}

/**
 * 输出 ZCode 钩子 JSON(additionalContext 字段)。
 * 钩子 stdout 被解析为 JSON(严格 schema,额外 key 会校验失败)。
 * 空输出也合法(exit 0 + 无 stdout)。
 */
function main() {
  const projectDir = process.env.ZCODE_PROJECT_DIR || process.cwd();
  // workspace 目录(可由 plugin.json userConfig 配置,默认 workspace)
  const workspaceDir = path.join(projectDir, "workspace");
  const constraintsDir = path.join(workspaceDir, "docs", "constraints");

  const constraints = loadActiveConstraints(constraintsDir);

  if (constraints.length === 0) {
    // 规矩库为空:静默通过,不报错
    console.error("[inject-constraints] 规矩库为空或不存在,跳过注入");
    process.exit(0);
  }

  // 按标签分组,格式化成可读文本注入
  const byTag = {};
  for (const c of constraints) {
    if (!byTag[c.tag]) byTag[c.tag] = [];
    byTag[c.tag].push(`[${c.num}] ${c.title}: ${c.rule}`);
  }

  const lines = ["## 已注入规矩(SessionStart 钩子自动,按标签过滤)", ""];
  for (const tag of VALID_TAGS) {
    if (!byTag[tag]) continue;
    lines.push(`### ${tag}`);
    for (const line of byTag[tag]) lines.push(`- ${line}`);
    lines.push("");
  }

  const additionalContext = lines.join("\n");

  // 严格按 ZCode 钩子输出 schema
  console.log(JSON.stringify({
    additionalContext: additionalContext
  }));
  process.exit(0);
}

main();
