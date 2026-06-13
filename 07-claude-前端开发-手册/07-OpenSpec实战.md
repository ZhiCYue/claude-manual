# 第 7 章 · OpenSpec 实战

OpenSpec 是把第 6 章的规格驱动开发**自动化**的开源工具。这一章讲它怎么装、三阶段工作流、接进 Claude Code,以及一个完整的"给前端加一个功能"的走查。

---

## 7.1 OpenSpec 是什么

**OpenSpec 是一个轻量、开源的规格驱动开发(SDD)框架,专门给 AI 编程助手用。**

- 开源(GitHub: Fission-AI/OpenSpec),2026 年 6 月约 5.2 万 star,是这一类里最活跃的。
- **免费,不要 API key**。
- **支持 25+ AI 助手**:Claude Code、GitHub Copilot、Cursor 等——这正是第 6.6 节说的"工具中立"。
- 它在你项目里加一个轻量的 spec 层,把"propose(提案)→ apply(实现)→ archive(归档)"做成明确的三阶段工作流。

## 7.2 安装与初始化

```bash
# 全局安装（需 Node 20.19+,支持 npm/pnpm/yarn/bun）
npm install -g @fission-ai/openspec@latest

# 在你的项目里初始化
cd your-frontend-project
openspec init
```

`openspec init` 会在项目里设置 OpenSpec 框架,并配好各 AI 助手的斜杠命令(包括 Claude Code 的)。

## 7.3 三阶段工作流

OpenSpec 的核心是三个阶段,在 Claude Code(或其他助手)里用斜杠命令驱动:

```
/opsx:propose "功能名"   →  提案:AI 生成 spec 文件,你审查
        ↓
/opsx:apply              →  实现:AI 照 spec 的任务清单逐项实现
        ↓
/opsx:archive            →  归档:完成的变更归档,更新正式 specs
```

### 阶段 1:Propose(提案)

```
/opsx:propose "记住我登录"
```

AI 创建一个变更目录,里面有:

- **proposal.md** —— 为什么做、概述
- **specs/** —— 需求和测试场景
- **design.md** —— 技术方案
- **tasks.md** —— 实现清单(可勾选)

**这一步的关键是你审查这些 spec**——这是第 6 章说的最便宜的纠错点。spec 不对就改,改到满意再往下。

### 阶段 2:Apply(实现)

```
/opsx:apply
```

AI 照 `tasks.md` 的清单逐项实现,系统地做完每一项。因为有审过的 spec 兜着,这一步的产出是确定的、符合预期的。

### 阶段 3:Archive(归档)

```
/opsx:archive
```

把完成的变更移到 `openspec/changes/archive/`(带时间戳),更新正式 specs,准备下一个功能。这一步让 **spec 与代码保持同步**——文档不再脱节。

## 7.4 目录结构

OpenSpec 在项目里建这样的结构(全部进 git):

```
your-frontend-project/
├── openspec/
│   ├── changes/
│   │   ├── 记住我登录/              # 进行中的变更
│   │   │   ├── proposal.md
│   │   │   ├── design.md
│   │   │   ├── tasks.md
│   │   │   └── specs/
│   │   └── archive/
│   │       └── 2026-06-13-记住我登录/   # 归档的历史变更
│   └── [配置文件]
├── src/                            # 你的前端代码
└── ...
```

spec 进 git 意味着:**变更可审查(PR 里能看 spec 的 diff)、可追溯、与代码同仓**。

## 7.5 接进 Claude Code

`openspec init` 会自动配好 Claude Code 的斜杠命令(`/opsx:propose` 等)。配合 Claude Code 的能力,SDD 工作流更顺:

- **propose 阶段**用 Plan Mode 的思路:AI 只读地理解现状、生成 spec,你审。
- **apply 阶段**用 Claude Code 的工具:它照 spec 改代码、跑测试、用 Playwright 验证(第 4 章的地面真相)。
- **配置更新**:`openspec update` 更新各助手的指令和命令;`openspec config profile` 选更丰富的工作流选项。

## 7.6 完整走查:给前端加"记住我"功能

把全章串起来,一个真实的前端功能从需求到归档:

```
需求:登录页加"记住我"——勾选后,关闭浏览器重开仍保持登录

① /opsx:propose "记住我登录"
   AI 生成:
     proposal.md  —— 目的:让用户不必每次重登
     specs/       —— 需求:勾选框 + 勾选时 token 存 localStorage(否则 sessionStorage)
                     验收场景:勾选→关浏览器→重开仍登录;不勾→重开需重登
     design.md    —— 方案:改 LoginForm 组件、auth store、token 存储逻辑、涉及哪些文件
     tasks.md     —— 1.加勾选框 2.改存储逻辑 3.改读取逻辑 4.补测试 5.e2e 验证

② 你审 spec —— 发现漏了"安全"考量,补一句:
   "记住我的 token 有效期 30 天,且要支持主动登出清除"
   （这是最便宜的纠错点——改 spec 一句话,而非回滚代码）

③ /opsx:apply
   Claude Code 照 tasks.md 逐项实现:
     · 改 LoginForm 加勾选框
     · 改 auth store 的存储逻辑
     · 补 Vitest 组件测试
     · 用 Playwright MCP 实际操作验证(地面真相,第 4.4 节):
       勾选→登录→截图→刷新→确认仍登录

④ 你审查代码 + CI 跑过(第 5 章工具中立质量门)

⑤ /opsx:archive
   变更归档,正式 specs 更新——下次有人(或 AI)看 specs,
   就知道"记住我"是怎么设计的
```

注意这个流程同时用到了两根支柱:**支柱二(OpenSpec 的 spec 驱动)让 AI 不跑偏,支柱一(好环境:测试、Playwright、CI)让 AI 有地面真相、产出有质量门兜底。**

## 7.7 OpenSpec 和 AGENTS.md / 双层设计的关系

第 6.6 节说 SDD 是工具中立的,这里点明它和第六册的精确关系:

| 第六册的概念 | OpenSpec 的对应 |
|---|---|
| 工具中立的"约定唯一来源"(AGENTS.md) | OpenSpec 的 spec 是工具中立的"**要建什么**"的唯一来源 |
| 各 AI 工具引用同一份约定 | 各 AI 助手照同一份 spec 实现(支持 25+) |
| 双层设计 | OpenSpec 在工具中立层(spec 谁都能读),不绑定 Claude Code |

所以可以这样理解:

> **AGENTS.md 是"这个项目的长期约定"的唯一来源,OpenSpec 的 spec 是"这次要建什么"的唯一来源。** 两者都是工具中立的共享契约,都让混合工具团队照同一个东西干活。

在混合工具团队里,OpenSpec 让"用 Claude Code 的人"和"用 Cursor 的人"照**同一份审过的 spec** 实现同一个功能——方向一致、可审查。

## 7.8 什么时候用 OpenSpec

承接第 6.7 节(SDD 何时用),加上工具层面的考量:

**适合**:较大的功能、模糊的需求、多人协作、迁移/重构、想要可审查的"要建什么"记录。

**可以不用**:改文案/样式这类明确小改(直接让 AI 做更快)、纯个人的探索性尝试。

**采纳建议**:别一上来全用。先在一个较大的功能上试一次完整的 propose→apply→archive,体会"先审 spec"带来的确定性,再决定哪些任务值得走这套流程。这呼应第六册第 8 章的"分阶段、验证再扩大"。

## 7.9 OpenSpec 检查清单

- [ ] `npm install -g @fission-ai/openspec` + `openspec init`
- [ ] 较大/模糊/多人的功能,走 propose → apply → archive
- [ ] propose 后**认真审 spec**(最便宜的纠错点),不满意就改
- [ ] apply 时让 AI 跑测试 + Playwright 验证(地面真相)
- [ ] archive 让 spec 与代码同步
- [ ] spec 进 git,PR 里能审 spec diff
- [ ] 混合工具团队:把 spec 当工具中立的"要建什么"唯一来源
- [ ] 小的明确改动不必走 SDD,直接做更快

---

**本章资料来源:**
- [GitHub - Fission-AI/OpenSpec](https://github.com/Fission-AI/OpenSpec)
- [OpenSpec 官网](https://openspec.pro/)
- [Spec-Driven Development with AI (GitHub Blog)](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/)

---

下一章：[08 · AI 辅助前端完整工作流](08-AI辅助前端完整工作流.md)
