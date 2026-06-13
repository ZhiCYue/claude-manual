# 第 5 章 · 自定义命令与 Skills

把"每次都要打一遍的提示词"沉淀成可复用、可共享、可版本化的资产——这是从"会用"到"用得好"的分水岭。

## 5.1 自定义斜杠命令：一个 Markdown 文件就是一个命令

### 最小示例

```bash
mkdir -p .claude/commands
cat > .claude/commands/explain.md << 'EOF'
用通俗的中文解释以下代码在做什么，先讲整体意图，再讲关键细节：
$ARGUMENTS
EOF
```

使用：

```
/explain @src/core/scheduler.py
```

文件名（去掉 `.md`）就是命令名，正文就是提示词，`$ARGUMENTS` 被替换为你输入的参数。

### 存放位置决定作用域

| 位置 | 作用域 | 适合 |
|---|---|---|
| `项目/.claude/commands/` | 本项目（进 git，团队共享） | 项目特有流程 |
| `~/.claude/commands/` | 你的所有项目 | 个人通用工具 |

子目录会形成命名空间：`.claude/commands/git/fix.md` → 显示为 `/git:fix`。

### 完整语法：frontmatter + 三种动态注入

```markdown
---
description: 根据 issue 编号完成修复全流程
argument-hint: <issue编号>
allowed-tools: Bash(gh *), Bash(git *), Read, Edit, Grep
model: opus
---

## 背景信息（执行命令时自动采集）
- 当前分支：!`git branch --show-current`
- 工作区状态：!`git status --short`
- 我们的贡献规范：@CONTRIBUTING.md

## 任务
处理 GitHub issue #$1：
1. `gh issue view $1` 查看详情
2. 定位相关代码，实现修复
3. 补充回归测试并跑通过
4. 创建分支 `fix/issue-$1`，提交（message 引用 #$1），用 `gh pr create` 开 PR
```

三种动态注入语法：

| 语法 | 时机 | 作用 |
|---|---|---|
| `$ARGUMENTS` / `$1` `$2`… | 调用时 | 替换为全部/第 N 个参数 |
| `` !`命令` `` | 调用时 | **先执行**该 shell 命令，把输出嵌进提示词 |
| `@路径` | 调用时 | 把文件内容嵌进提示词 |

frontmatter 字段：

- `description`：在 `/` 补全列表里显示的说明
- `argument-hint`：参数提示
- `allowed-tools`：本命令执行期间额外放行的权限（不用每次确认）
- `model`：强制用某个模型执行本命令

> **原理**：`` !`git status` `` 这类注入发生在**提示词送达模型之前**，由 harness 执行。
> 好处是模型一上来就拿到了新鲜的现场信息，不用花轮次自己去查——
> 这既省 token，又避免它"忘了先看状态"。

### 再来两个实用范例

`~/.claude/commands/commit.md`（个人全局，智能提交）：

```markdown
---
description: 分析当前改动并生成规范的 commit
allowed-tools: Bash(git add *), Bash(git status), Bash(git diff *), Bash(git commit *), Bash(git log *)
---

- 当前改动：!`git status --short`
- 具体 diff：!`git diff HEAD`
- 最近提交风格参考：!`git log --oneline -5`

把上述改动按逻辑单元分组（如果混杂了多个无关改动，拆成多个 commit），
每个 commit 写符合 Conventional Commits 的英文 message，然后依次提交。
```

`.claude/commands/review-file.md`（项目级，文件审查）：

```markdown
---
description: 按团队 checklist 审查指定文件
argument-hint: <文件路径>
---

按 @docs/review-checklist.md 逐项审查 @$1，
输出表格：检查项 | 通过/不通过 | 具体位置 | 修改建议。
```

## 5.2 Skills：带"行李"的重型命令

### 和命令的区别

自定义命令 = 一段提示词。Skill = **一个目录**，除主指令外还能携带脚本、模板、参考文档，并且支持**自动触发**（不只手动调用）。

```
.claude/skills/release/
├── SKILL.md           # 主指令（必须，含 frontmatter）
├── checklist.md       # 附属文档：发布检查清单
├── templates/
│   └── changelog.md   # 附属模板
└── scripts/
    └── bump_version.py  # 附属脚本
```

`SKILL.md`：

```markdown
---
name: release
description: 执行版本发布全流程。当用户要求"发版"、"发布新版本"、"打 release"时使用。
---

# 发布流程

1. 读取 checklist.md，逐项检查并报告结果，任何一项不通过则停止并说明
2. 运行 `python scripts/bump_version.py --minor` 更新版本号
3. 按 templates/changelog.md 的格式，根据 `git log 上个tag..HEAD` 生成 CHANGELOG 条目
4. 提交、打 tag `v{新版本号}`、推送 tag
5. 用 `gh release create` 创建 GitHub Release，正文用刚生成的 changelog
```

调用方式两种：

```
/release                          # 手动
> 帮我发个新版本                    # 自动——描述匹配时 Claude 主动启用该 skill
```

`description` 写得越具体（**写清触发场景**，如上例的"当用户要求……时使用"），自动触发越准。

### 渐进式加载（Progressive Disclosure）原理

这是 Skill 设计中最精妙的一点：

```
平时：       上下文里只有一行 → "release: 执行版本发布全流程……"（几十 token）
任务匹配时：  加载 SKILL.md 全文（几百 token）
执行到需要时：才去读 checklist.md / 模板 / 跑脚本（按需）
```

所以你可以积累**几十个** Skill 而几乎不增加上下文负担。对比反面方案——把所有流程都塞进 CLAUDE.md，每次会话都全量加载，很快撑爆。

**推论（选型口诀）**：

- 每次会话都该知道 → `CLAUDE.md`
- 手动触发、一段话说得清 → **自定义命令**
- 流程复杂、带脚本模板、希望能自动触发 → **Skill**

### 附属脚本的妙用：确定性下沉

注意上面 `bump_version.py` 的设计思想：版本号递增是**纯机械逻辑**，写成脚本让 Claude 调用，而不是让 Claude "理解并手改"版本号。

> **原则：能用代码确定性完成的部分，下沉成脚本；只把需要判断的部分留给模型。**
> 这条原则贯穿 Hooks（第 6 章）和 MCP（第 7 章），是构建可靠 AI 工作流的核心手法。

## 5.3 插件（Plugins）：打包分发

命令、Skill、Hook、MCP 配置、子代理可以打包成**插件**，通过市场（marketplace）安装共享：

```
/plugin                # 浏览、安装、管理插件
```

团队玩法：建一个内部 git 仓库作为私有 marketplace，把团队的全套工作流（发布 skill、审查命令、规范 hooks）打包成插件，新人一条命令装齐。

---

下一章：[06 · Hooks 详解](06-Hooks详解.md)
