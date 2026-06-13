# 笔记应用 · 项目约定（AGENTS.md）

> 工具中立的唯一来源。CLAUDE.md @import 本文件。

## 技术栈

- Next.js（App Router）+ React 19 + TypeScript（strict）
- 数据层：lib/db.ts（示例用进程内 mock，真实项目换 Prisma/Drizzle）
- 用 React Compiler，不要手动 useMemo/useCallback/memo

## React 19 全栈约定

- **组件默认 Server Component**，直接 await 取数，不写 useEffect 取数
- 只有需要交互(state/事件)的组件才标 `"use client"`
- 改数据用 **Server Action**（`"use server"`），改完 `revalidatePath` 刷新
- 表单用 `useActionState` 管 pending/错误，不手写 loading state

## 结构（App Router 约定式）

```
app/                  # 路由 = 文件夹
  page.tsx            # Server Component
  <路由>/actions.ts   # Server Actions
  <路由>/*.tsx        # 该路由的组件
lib/                  # 数据层、工具
```

## 约定

- 服务端取数在 Server Component 里直接做，不要无脑全转 Client Component
- 改 UI 后用 Playwright 实际打开页面验证
- 较大功能走规格驱动：先 /opsx:propose 定 spec，审完再 apply

## 命令

`npm run dev` / `npm run build` / `npm run lint` / `npm run e2e`
