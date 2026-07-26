# ZCode 插件化完全指南

> 从原理到实战:理解 ZCode 插件机制,掌握把任何工具插件化的可复用方法论。
> 以 `qualify` 插件(定性→定量→评审流程)为剖析案例,附测试/原型设计工具的插件化方案。
>
> 适合:想自己开发 ZCode 插件的人、想理解 qualify 插件的人、想把现有工具插件化的人。

---

## 目录

- [一、ZCode 插件的 4 类核心组件](#一zcode-插件的-4-类核心组件)
- [二、插件清单与分发机制](#二插件清单与分发机制)
- [三、设计精髓:为什么这么设计](#三设计精髓为什么这么设计)
- [四、案例剖析:qualify 插件是怎么搭的](#四案例剖析qualify-插件是怎么搭的)
- [五、把工具插件化的通用 4 步法](#五把工具插件化的通用-4-步法)
- [六、实战方案 A:测试工具插件化](#六实战方案-a测试工具插件化)
- [七、实战方案 B:原型设计工具插件化](#七实战方案-b原型设计工具插件化)
- [八、必须避开的 5 个坑(实战血泪)](#八必须避开的-5-个坑实战血泪)
- [九、最小可行起步建议](#九最小可行起步建议)
- [附录:组件选型决策树](#附录组件选型决策树)

---

## 一、ZCode 插件的 4 类核心组件

ZCode 插件由 **4 类组件**组成,每类解决不同问题。理解这 4 类,就理解了插件化的全部。

### ① 命令(command)— 用户入口

**是什么**:用户在输入框敲 `/<名字>` 触发的指令。
**本质**:一个 `.md` 文件,内容是**给 AI 看的操作指令**(不是代码,是结构化的 prompt)。
**位置**:`commands/<名字>.md`

**文件结构**(每个命令文件都长这样):

```markdown
---
description: 初始化 — 在当前项目搭建工作环境    ← 命令补全时显示的说明
argument-hint: "[--force]"                       ← 参数提示
---

(下面是给 AI 看的指令:遇到这个命令时,按这些步骤执行)

## 第一步:检测是否已初始化
读 <项目根>/workspace/project.profile.md...

## 第二步:建目录骨架
在 <项目根>/workspace/ 下建:...
```

**关键认知**:
- 命令文件**不是代码,是 prompt**。AI 读了之后按指令干活(建目录、复制文件、调脚本)。
- 适合**确定性流程**:初始化、跑任务、查状态。
- 用户主动触发,适合"我知道现在要干啥"的场景。

### ② 技能(skill)— AI 能力包

**是什么**:封装"某种专业能力"的知识包,AI 在需要时调用。
**本质**:一个目录,里面有个 `SKILL.md`(主文档)+ 可能的资源文件。
**位置**:`skills/<名字>/SKILL.md`

```
skills/qualify/SKILL.md    ← "定性引导员"能力
skills/quantify/SKILL.md   ← "goal 提示词写作专家"能力
skills/review/SKILL.md     ← "评审员"能力
```

**命令 vs 技能的区别**(重要,容易混淆):

| 维度 | 命令(command) | 技能(skill) |
|---|---|---|
| 谁触发 | **用户**敲 `/名字` | **AI** 主动调用,或用户用 Skill 工具触发 |
| 文件形式 | 单个 `.md` 文件 | 目录(`SKILL.md` + 资源文件) |
| 适合场景 | 确定性流程(初始化、跑任务) | 需要判断/创意的能力(定性、评审、设计) |
| 复杂度 | 轻,一页指令 | 重,可带模板、子文档 |

**关键认知**:技能是插件的**核心价值载体**。需要 AI 做专业判断的事(怎么写测试、怎么设计交互),都封装成技能。

### ③ 钩子(hook)— 事件自动响应

**是什么**:在特定事件发生时**自动执行**的脚本。
**本质**:`.cjs` 脚本(真正的代码,不是 prompt)+ 一个 `hooks.json` 注册表。
**位置**:`hooks/`

```
hooks/hooks.json              ← 注册"什么事件 → 跑哪个脚本"
hooks/inject-constraints.cjs  ← 真正的脚本(Node.js)
```

**ZCode 支持的事件类型**:

| 事件 | 触发时机 | 典型用法 |
|---|---|---|
| `SessionStart` | 会话开始/恢复 | 注入上下文(规矩库、项目配置) |
| `Stop` | 一轮对话结束 | 提示下一步操作 |
| `PostToolUse` | 工具调用后(Write/Edit/Bash 等) | 文件变更后自动发通知 |

**hooks.json 结构**:

```json
{
  "hooks": {
    "SessionStart": [{
      "matcher": "startup|resume|clear|compact",
      "hooks": [{
        "type": "process",
        "command": "node",
        "args": ["脚本绝对路径或 ${ZCODE_PLUGIN_ROOT}/hooks/xxx.cjs"],
        "timeoutMs": 5000,
        "statusMessage": "状态栏显示的文字"
      }]
    }],
    "PostToolUse": [{
      "matcher": "Write|Edit",
      "hooks": [{...}]
    }]
  }
}
```

**关键认知**:
- 钩子是**唯一需要写真正代码**的地方(命令和技能都是 prompt)。
- 适合**机械、确定性**的事:注入上下文、发通知、跑测试、采集数据。
- **不适合**需要判断的事(那是技能的活)。
- `${ZCODE_PLUGIN_ROOT}` 变量只在插件正式加载时被解析;**散装部署时必须改成绝对路径**(详见第八节坑 5)。

### ④ 模板(templates)— 静态资源

**是什么**:命令/技能运行时引用的固定模板文件。
**位置**:`templates/`
**例子**:定性表模板、评审报告模板、tasks.json 骨架。

**关键认知**:模板是**死文件**,命令和技能在运行时读它们、填内容、写到产物目录。把可复用的固定结构抽出来,避免在 prompt 里重复描述长篇结构。

---

## 二、插件清单与分发机制

### plugin.json — 插件的身份证

每个插件根目录必须有 `.zcode-plugin/plugin.json`:

```json
{
  "name": "qualify",              ← 必填,小写字母/数字开头
  "version": "0.1.0",
  "description": "一句话说明",
  "author": { "name": "xxx" },
  "license": "MIT",
  "skills": "skills",             ← 告诉 ZCode 各组件在哪个目录
  "commands": "commands",
  "userConfig": {                 ← 用户可配置项(每个都要有 title!)
    "workspace_dir": {
      "type": "string",
      "title": "工作产物根目录",   ← 必填!缺了会启用失败
      "description": "...",
      "default": "workspace"
    }
  }
}
```

**注意**:
- **不要写 `"hooks": "hooks/hooks.json"`**(重复声明会引发异常,标准位置自动发现)。
- `userConfig` 每个配置项都要有 `title`(UI 显示标题)和 `description`。

### marketplace.json — 插件市场的目录

marketplace 是一个仓库,根目录放 `marketplace.json` 列出所有插件:

```json
{
  "name": "my-market",
  "description": "市场说明",
  "plugins": [
    {
      "name": "qualify",
      "source": "./plugins/qualify",    ← 相对路径,跨机器通用
      "description": "插件说明",
      "version": "0.1.0",
      "category": "workflow",
      "tags": ["workflow", "chinese"]
    }
  ]
}
```

**目录结构**(marketplace 仓库):

```
my-market/                       ← 仓库根(marketplace.json 在这)
├── marketplace.json
└── plugins/
    └── qualify/                 ← 插件目录
        ├── .zcode-plugin/plugin.json
        ├── commands/
        ├── skills/
        ├── hooks/
        └── templates/
```

### 分发方式(用户怎么装)

| 方式 | 用户填什么 | 适合场景 |
|---|---|---|
| GitHub 仓库 | `owner/repo` | 公开分发 |
| Gitee 仓库 | `https://gitee.com/owner/repo.git` | 国内用户(墙问题) |
| 本地路径 | 绝对路径 | 开发调试、内网 |
| zip 解压 | 解压后目录的绝对路径 | 离线分发 |

---

## 三、设计精髓:为什么这么设计

理解这三个精髓,就理解了 ZCode 插件区别于"纯对话"的根本价值。

### 精髓 1:判断类交给 AI,机械类交给脚本

| 组件 | 形式 | 为什么 |
|---|---|---|
| 命令、技能 | `.md`(prompt) | 需要判断/创意,适合 AI 执行 |
| 钩子 | `.cjs`(代码) | 确定性操作,脚本零误差 |

**反面教材**(qualify 插件踩的坑):`/qualify-init` 命令是 prompt,里面写"复制模板文件"——结果 AI 执行时找不到模板路径(`${ZCODE_PLUGIN_ROOT}` 变量解析不了),只生成了 AGENTS.md。

**教训**:**机械文件操作(建目录、复制文件)应该用钩子脚本,不该靠 AI 执行 prompt**。AI 适合做有判断的事,不适合做确定性的事。

### 精髓 2:状态在文件,不在上下文(防腐化)

这是 qualify 插件的核心思想:**所有状态落盘**,不靠对话记忆。

- 定性表 → `docs/phases/phase-X.md`
- 任务清单 → `.qualify/X/tasks.json`
- 评审报告 → `docs/reviews/phase-X-review.md`

几小时后对话上下文腐化了,新会话读文件就能接着干。这是插件比纯对话强的根本原因——**插件把"流程状态"从易失的上下文,转移到持久的文件系统**。

### 精髓 3:目录约定 > 配置

不写复杂配置文件,靠**目录结构约定**:

- 定性表永远在 `docs/phases/`
- 规矩永远在 `docs/constraints/`
- 命令永远在 `commands/`
- 钩子永远在 `hooks/hooks.json`

约定死了,插件代码就简单(不用读配置找文件在哪),用户也好理解(产物在哪一目了然)。

---

## 四、案例剖析:qualify 插件是怎么搭的

### 整体结构

```
qualify/
├── .zcode-plugin/plugin.json    ← 身份证
├── commands/                    ← 6 个命令(用户入口)
│   ├── qualify-init.md          ← /qualify-init 初始化
│   ├── auto-run.md              ← /auto-run 自动编排
│   ├── run-goal.md              ← /run-goal 执行
│   ├── quantify.md              ← /quantify 定量
│   ├── review.md                ← /review 评审
│   └── constraints.md           ← /constraints 规矩库
├── skills/                      ← 3 个技能(AI 能力)
│   ├── qualify/SKILL.md         ← 定性引导员(发散+收敛)
│   ├── quantify/SKILL.md        ← goal 提示词写作专家
│   └── review/SKILL.md          ← 评审员
├── hooks/                       ← 钩子(自动响应)
│   ├── hooks.json               ← 事件注册
│   ├── inject-constraints.cjs   ← SessionStart 注入规矩
│   ├── trigger-review.cjs       ← Stop 提示评审
│   └── notify-feishu.cjs        ← PostToolUse 发飞书
└── templates/                   ← 模板
    ├── qualification-form.md    ← 7 槽定性表
    ├── review-report.md         ← 评审报告
    ├── constraint.md            ← 规矩文件
    ├── goal-prompt.md           ← goal 提示词骨架
    └── tasks.json               ← tasks 骨架
```

### 一次完整流程怎么跑(组件协作)

用户要做"用户登录功能",从定性到评审:

```
1. 用户敲 /qualify-init
   → 命令文件(prompt)被读
   → AI 按指令建 workspace 目录 + 复制模板

2. 用户敲 /qualify 做一个用户登录功能
   → 命令触发 qualify skill
   → AI 进入"定性引导员"角色,跟用户发散+收敛
   → 产出 docs/phases/phase-A.md(7 槽定性表)【状态落盘】

3. 会话开始时
   → SessionStart 钩子自动跑 inject-constraints.cjs
   → 读规矩库,把相关规矩注入到 AI 上下文(你看过的"已注入规矩")

4. 用户敲 /quantify A
   → 命令触发 quantify skill
   → AI 读定性表+规矩库,渲染出 .qualify/A/tasks.json + goal.md【状态落盘】

5. 用户敲 /run-goal A
   → 命令按 tasks.json 派子代理执行
   → 子代理按 goal.md 干活,更新 tasks.json 状态【状态落盘】

6. 用户敲 /review A
   → 命令触发 review skill
   → AI 读 git diff(不读对话!),对照完成条件生成评审报告【状态落盘】

7. 评审报告被 Write 工具写入瞬间
   → PostToolUse 钩子自动跑 notify-feishu.cjs
   → 发飞书通知

8. 一轮对话结束
   → Stop 钩子跑 trigger-review.cjs
   → 提示用户"该评审了"
```

**关键观察**:每一步的状态都落在文件里(phase-A.md → tasks.json → 评审报告),即使中途上下文崩了,新会话读文件就能接着干。

---

## 五、把工具插件化的通用 4 步法

### 第 1 步:拆能力 → 对应到 4 类组件

对你想插件化的工具,把它的能力拆成两类:

| 能力类型 | 用什么 | 判断依据 | 例子 |
|---|---|---|---|
| **需要 AI 判断/创意** | skill 或 command | "怎么做"需要思考 | 怎么写测试用例、怎么设计交互 |
| **确定性自动化** | hook(脚本) | 固定步骤,不需思考 | 跑测试、生成覆盖率、截图对比 |

再细分触发方式:

| 触发方式 | 用什么 | 例子 |
|---|---|---|
| 用户主动触发 | command | `/gen-tests` |
| 事件自动响应 | hook | 代码改了自动跑测试 |

### 第 2 步:定义产物结构(状态落盘)

想清楚你的插件产出什么文件,放哪。**这是防腐化的关键**。

格式建议:
```
workspace/
└── <你的工具名>/
    ├── inputs/     ← 输入(用户提供的)
    ├── outputs/    ← 输出(AI 生成的)
    └── state/      ← 状态(进度、历史)
```

### 第 3 步:写 plugin.json + 目录骨架

照着第二节模板写,注意:
- name 小写字母开头
- userConfig 每项有 title
- **不要写 hooks 字段**(自动发现)

### 第 4 步:逐个实现组件,从 skill 开始

**skill 是核心价值**,先写 skill。命令只是触发 skill 的入口,钩子是辅助自动化。

实现顺序:**skill → command → hook → template**。

---

## 六、实战方案 A:测试工具插件化

### 能力拆解

| 能力 | 形式 | 触发 |
|---|---|---|
| 分析代码,设计测试用例(边界/异常/正常) | skill | `/gen-tests` |
| 跑测试 | hook 脚本 | `/run-tests` 或代码改动自动跑 |
| 生成覆盖率报告 | hook 脚本 | `/coverage` |
| 测试失败发通知 | hook 脚本 | 测试失败自动触发 |

### 目录结构

```
testing-plugin/
├── .zcode-plugin/plugin.json
├── commands/
│   ├── gen-tests.md          ← /gen-tests 触发生成测试
│   ├── run-tests.md          ← /run-tests 跑测试
│   └── coverage.md           ← /coverage 看覆盖率
├── skills/
│   └── test-designer/SKILL.md ← 测试用例设计专家(核心)
├── hooks/
│   ├── hooks.json
│   ├── auto-run-on-save.cjs  ← PostToolUse:代码改了自动跑测试
│   └── notify-fail.cjs       ← 测试失败发飞书
└── templates/
    ├── test-template.py      ← 测试文件模板
    └── coverage-report.md    ← 覆盖率报告模板
```

### 产物结构建议

```
workspace/
└── testing/
    ├── cases/               ← 测试用例(按模块组织)
    │   ├── user.test.js
    │   └── order.test.js
    ├── results/             ← 测试结果(历史可追溯)
    │   └── 2026-07-27.json
    └── coverage/            ← 覆盖率报告
        └── latest.md
```

### test-designer skill 的核心思路

SKILL.md 里要告诉 AI:
1. 读目标代码,识别函数/类的公共接口
2. 对每个接口,按"正常输入 / 边界值 / 异常输入"三类设计用例
3. 用项目现有的测试框架写测试(看 package.json / requirements.txt 判断框架)
4. 测试文件按 `<模块>.test.<ext>` 命名,放到 `workspace/testing/cases/`

---

## 七、实战方案 B:原型设计工具插件化

### 能力拆解

| 能力 | 形式 | 触发 |
|---|---|---|
| 设计界面(布局/配色/交互) | skill | `/design-ui` |
| 生成可点击原型(HTML) | skill + 模板 | `/make-prototype` |
| 评审 UI | skill | `/review-ui` |
| 用户旅程分析 | skill | `/user-journey` |

**注意**:原型设计自动化空间小(主要是创意工作),钩子可以不要或很少。

### 目录结构

```
prototype-plugin/
├── .zcode-plugin/plugin.json
├── commands/
│   ├── design-ui.md          ← /design-ui 设计界面
│   ├── make-prototype.md     ← /make-prototype 生成原型
│   └── review-ui.md          ← /review-ui 评审
├── skills/
│   ├── ui-designer/SKILL.md      ← UI 设计专家(布局/配色/交互)
│   └── ux-researcher/SKILL.md    ← UX 研究员(用户旅程)
└── templates/
    ├── wireframe.html        ← 线框图模板
    ├── clickable-prototype.html ← 可点击原型模板
    └── design-spec.md        ← 设计规范模板
```

### 产物结构建议

```
workspace/
└── prototype/
    ├── designs/              ← 设计稿(HTML/MD)
    │   ├── home-page.html
    │   └── login.html
    ├── specs/                ← 设计规范
    │   └── design-system.md
    └── journeys/             ← 用户旅程
        └── checkout-flow.md
```

---

## 八、必须避开的 5 个坑(实战血泪)

这些都是 qualify 插件开发/部署过程中真实踩过的坑。

### 坑 1:命令名撞 ZCode 内置

**现象**:命令 `/init` 被内置命令抢占,插件命令不触发。
**原因**:ZCode 内置命令优先级高于插件命令。
**避法**:**命令名加插件前缀**。qualify 插件的 `/init` 改成 `/qualify-init`。
**通用规则**:`/<插件名>-<动作>`,如 `/test-gen`、`/proto-design`。

### 坑 2:plugin.json 写 hooks 字段

**现象**:插件能装但不能启用,开关打不开。
**原因**:官方文档明确说"标准位置 `hooks/hooks.json` 会自动发现,manifest 里再声明一次会引发异常"。
**避法**:**plugin.json 里不要写 `"hooks": "hooks/hooks.json"`**,放 `hooks/hooks.json` 让 ZCode 自动发现。

### 坑 3:userConfig 缺 title 字段

**现象**:启用失败,且无报错。
**原因**:官方示例每个配置项都有 title,缺了会导致 UI 渲染异常。
**避法**:userConfig 每个配置项**都要有 `title` + `description` + `type` + `default`**。

### 坑 4:marketplace 用绝对路径或 pluginRoot + 相对 source 组合

**现象**:添加市场报 `Unsupported or missing plugin source`。
**原因**:`pluginRoot: "plugins"` + `source: "./qualify"` 组合在某些 ZCode 版本解析失败;绝对路径换机器就失效。
**避法**:**不设 pluginRoot,source 直接写完整相对路径 `"./plugins/qualify"`**。这是官方推荐的最稳妥写法,跨机器通用。

### 坑 5:机械操作写进 prompt 命令

**现象**:命令执行不全(比如只生成一半文件)。
**原因**:AI 执行 prompt 时,遇到 `${ZCODE_PLUGIN_ROOT}` 等变量无法解析,静默跳过。
**避法**:**机械文件操作(建目录、复制模板)用钩子脚本写**,不写进命令 prompt。命令 prompt 只做"需要判断"的事。
**散装部署特例**:散装模式下 `${ZCODE_PLUGIN_ROOT}` 不被解析,hooks.json 必须用绝对路径。

---

## 九、最小可行起步建议

**不要一上来做完整套**。先做一个最小插件验证流程跑通,再迭代。

### 第一周:最小插件(1 命令 + 1 技能)

目标:跑通"用户敲命令 → AI 执行 → 产物落盘"这个最小闭环。

```
my-plugin/
├── .zcode-plugin/plugin.json
├── commands/
│   └── do-sth.md             ← 唯一命令
├── skills/
│   └── my-skill/SKILL.md     ← 唯一技能
└── templates/
    └── my-template.md
```

### 验证清单(跑通这些就算成功)

- [ ] plugin.json 合法(`node -e "JSON.parse(...)"` 或 python 验证)
- [ ] 命令能被识别(输入 `/` 下拉里有)
- [ ] 命令触发后,skill 能被调用
- [ ] 产物文件能正确生成到约定目录
- [ ] 跨工作区能用(不是只在某个项目里生效)

### 迭代节奏

1. **第一周**:最小闭环(1 命令 + 1 技能)
2. **第二周**:加钩子(自动化)
3. **第三周**:加模板(产物标准化)
4. **第四周**:加更多命令(完整工作流)
5. **第五周**:写 README,发布到 marketplace

---

## 附录:组件选型决策树

遇到一个功能,怎么决定用哪种组件?按这个树走:

```
这个功能需要 AI 做判断/创意吗?
│
├─ 是 → 用 skill(封装能力)
│      │
│      └─ 需要用户主动触发吗?
│             ├─ 是 → 加一个 command 调这个 skill
│             └─ 否 → 让 AI 在需要时自动调用 skill
│
└─ 否(确定性操作)→ 用 hook(脚本)
       │
       └─ 什么时候执行?
              ├─ 会话开始 → SessionStart 钩子
              ├─ 工具调用后 → PostToolUse 钩子
              └─ 对话结束 → Stop 钩子
```

**一句话总结**:
- **判断类 → skill**(`SKILL.md`,prompt)
- **机械类 → hook**(`.cjs`,代码)
- **用户入口 → command**(`.md`,prompt,触发 skill)
- **状态落盘 → 约定目录**(防腐化)

---

## 参考资料

- ZCode 官方插件文档:https://zcode.z.ai/cn/docs/plugin
- 本文档对应的插件仓库:
  - GitHub: https://github.com/fan1cheng2lin3/zcode-qualify-plugin
  - Gitee: https://gitee.com/XiaoYv123/tddces

---

*文档版本:v1.0 | 最后更新:2026-07-27 | 基于 qualify 插件 v0.1.0 实战总结*
