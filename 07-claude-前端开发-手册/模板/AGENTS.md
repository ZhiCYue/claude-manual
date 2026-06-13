# 前端项目约定（AGENTS.md）

> 团队约定的**唯一来源**，工具中立。CLAUDE.md `@import` 本文件，Cursor 等其他 AI 工具配置也引用本文件，不另立一份。改约定只改这里。

## 技术栈

- React 19 + Vite + TypeScript（`strict: true`）
- 路由：React Router
- 服务端状态：TanStack Query（React Query）
- 全局客户端状态：Zustand（仅放真正的全局状态）
- 样式：Tailwind
- 测试：Vitest + React Testing Library（单元/组件）、Playwright（e2e）
- 用 React Compiler，**不要手动 useMemo/useCallback/memo**（除非有实测的性能问题）

> 替换成你项目的真实技术栈。这份清单也帮 AI 不给过时代码（不用 CRA、不手动 memo、不用 file-loader 等）。

## 项目结构（按功能组织）

```
src/
├── features/<功能>/     # 该功能的 components/hooks/api/types 都在一起
├── shared/             # 跨功能共享的 components/hooks/lib
└── app/                # 路由、布局、provider
```

- 新功能放 `features/<功能>/`，不要按类型堆 `components/`
- 通用 UI 组件放 `shared/components/`

## 组件约定

- 函数组件 + hooks，不用 class
- 可复用的有状态逻辑抽成自定义 hook
- 组合优于继承；不要过度抽象（别为一次性的东西造抽象）
- 通用组件要有 Storybook 故事

## 状态管理（三分法）

- 本地 UI 状态 → `useState`/`useReducer`
- 服务端数据 → TanStack Query（**不要塞进 Zustand**）
- 真正的全局客户端状态 → Zustand

## 不要做的

- 不要用 CRA（已停止维护）
- 不要手动 memo（React Compiler 处理）
- 不要把服务端数据放全局 store
- 不要装 file-loader 等过时工具

## 命令

| 做什么 | 命令 |
|---|---|
| 开发 | `npm run dev` |
| 测试 | `npm test` |
| e2e | `npm run e2e` |
| 类型检查 | `npm run typecheck` |
| Lint | `npm run lint` |
| 构建 | `npm run build` |

## AI 生成代码

- 你提交的代码（无论是否 AI 生成）你负全责，必经审查、有测试
- 改 UI 后用 Playwright 实际打开页面验证，别只看代码
- 较大功能走规格驱动（OpenSpec）：先 propose 定 spec，审完再 apply
