# 任务看板 · 项目约定（AGENTS.md）

> 工具中立的唯一来源。CLAUDE.md @import 本文件，其他 AI 工具配置也引用它。

## 技术栈

- Vite + React 19 + TypeScript（strict）
- 服务端状态：TanStack Query（React Query）
- 用 React Compiler，不要手动 useMemo/useCallback/memo
- 测试：Vitest + React Testing Library（组件）、Playwright（e2e）

## 结构（按功能组织）

```
src/features/<功能>/   # 该功能的 types/api/hook/组件/测试都在一起
src/main.tsx          # 入口 + QueryClientProvider
```

## 约定

- 服务端数据一律用 TanStack Query，**不要塞进任何全局 store**
- 函数组件 + hooks，逻辑抽进 useXxx hook，组件保持简洁
- 改动后跑 `npm test` 和 `npm run e2e` 验证
- 改 UI 用 Playwright 实际打开页面看，别只看代码

## 命令

`npm run dev` / `npm test` / `npm run e2e` / `npm run typecheck` / `npm run lint`
