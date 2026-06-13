# 项目记忆（前端 · CLAUDE.md）

> Claude Code 配置层。实质约定来自工具中立的 AGENTS.md，这里只放 Claude Code 特有的补充。
> 个人偏好不要写这里（团队共享、进 git）——放 `~/.claude/CLAUDE.md` 或 `CLAUDE.local.md`。

团队完整约定见 @AGENTS.md（技术栈、结构、组件约定、状态管理都在那）。

## Claude Code 特有补充

- 开发服务器：`npm run dev`（Vite，端口 3000）
- 改完 UI **务必用 Playwright MCP 实际打开页面验证**，截图确认，别只看代码
- 改组件后跑 `npm test` 和 `npm run typecheck`
- 较大功能用规格驱动：先 `/opsx:propose` 定 spec，我审完再 `/opsx:apply`
- 复杂改动先用 Plan Mode 出方案

## 写代码注意（防过时）

- 用 React 19 模式：Server Components（框架场景）、Actions、新 hooks
- 用 React Compiler，**不要加 useMemo/useCallback/memo**
- 服务端数据用 TanStack Query，不要塞 Zustand
- 不要用 CRA、不要装 file-loader 等过时工具

## 提交前

- 必过 `npm run lint`、`npm run typecheck`、`npm test`
- 自己过一遍 diff，你对提交的代码负全责
