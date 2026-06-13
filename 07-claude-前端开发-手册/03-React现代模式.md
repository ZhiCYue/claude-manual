# 第 3 章 · React 现代模式（React 19）

让 AI 写出**不过时**的 React 代码,你得知道 React 19 时代的范式。这一章讲当前(2026)的 React 模式:Server Components、Actions、新 hooks、React Compiler,以及状态管理的现代分法。

---

## 3.1 心智模型的转变

React 19 最大的变化是**心智模型**:

> 从"一个跑在浏览器里的 JavaScript 库",变成"一个横跨服务端和客户端的全栈组件模型"。

这个转变体现在 Server Components 和 Actions 上(下面讲)。但注意一个前提:**这些服务端特性需要框架(Next.js)支持**——纯 Vite SPA 跑在客户端,用不了 Server Components。所以读这一章要分清:

- **用 Next.js**(全栈框架):能用 Server Components、Server Actions——这是 React 19 的"完全体"。
- **用 Vite SPA**(纯客户端):用客户端的那部分(新 hooks、use()、Compiler),服务端取数靠 TanStack Query。

## 3.2 Server Components(框架场景)

在 Next.js(App Router)里,**Server Components 是默认**:

- 组件**在服务端渲染**,不进客户端包——**零客户端 JS 成本**。
- **直接在组件里取数**,不需要 `useEffect` + loading state 那套:

```jsx
// 这是个 Server Component(Next.js App Router,默认就是)
async function ProductList() {
  const products = await db.products.findMany();  // 直接 await,服务端执行
  return (
    <ul>
      {products.map((p) => <li key={p.id}>{p.name}</li>)}
    </ul>
  );
}
```

需要交互(state、事件)的组件,标 `"use client"` 变成 Client Component。**原则:默认 Server Component,只在需要交互时才 `"use client"`**——客户端包更小、首屏更快。

## 3.3 Actions 与表单(框架场景)

**Server Actions** 让客户端组件调用在服务端执行的异步函数,React 自动处理缓存重验证和乐观更新:

```jsx
// 服务端 action
async function updateName(formData) {
  "use server";
  await db.user.update({ name: formData.get("name") });
}

// 客户端表单直接用
function Form() {
  return (
    <form action={updateName}>
      <input name="name" />
      <button>保存</button>
    </form>
  );
}
```

配合新 hooks 处理表单状态:

- **`useActionState`**:自动管理 action 的 loading / 成功 / 错误状态,省掉手写一堆 state。
- **`useFormStatus`**:读取所在表单的提交状态(如 pending)。
- **`useOptimistic`**:乐观更新——提交时先乐观地更新 UI,失败再回滚。和 Server Actions 配合最佳。

```jsx
function Form() {
  const [state, formAction, isPending] = useActionState(updateName, null);
  return (
    <form action={formAction}>
      <input name="name" />
      <button disabled={isPending}>{isPending ? "保存中…" : "保存"}</button>
    </form>
  );
}
```

这套大幅简化了表单的异步处理——以前要手写 loading/error/optimistic,现在 hooks 自动管。

## 3.4 `use()` Hook

`use()` 是 React 19 最灵活的新原语,能读 Promise 或 Context 的值,**且可以条件式调用**(其他 hook 都不行):

```jsx
function Profile({ userPromise }) {
  const user = use(userPromise);   // 读 Promise,配合 Suspense
  return <h1>{user.name}</h1>;
}
```

配合 `<Suspense>`,数据没到时显示 fallback,到了自动渲染。

## 3.5 React Compiler:告别手动 memo

React 19 时代的 **React Compiler** 自动做记忆化(memoization):

- 它在构建时分析你的组件,**自动插入优化**,减少不必要的重渲染。
- 意味着你**不再需要到处手写 `useMemo` / `useCallback` / `React.memo`**——编译器替你做。

对 AI 辅助的影响:**让 AI 别再到处加 useMemo/useCallback**(那是 Compiler 之前的模式,现在多余)。如果 AI 给你的代码堆满手动 memo,那是过时习惯——在 CLAUDE.md 里说明"项目用 React Compiler,不要手动 memo,除非有实测的性能问题"。

## 3.6 状态管理的现代分法

最常见的前端错误是状态管理一锅粥。现代的分法是**按状态的性质分三类**:

| 状态类型 | 是什么 | 用什么 |
|---|---|---|
| **本地 UI 状态** | 一个组件内部的(开关、输入框) | `useState` / `useReducer` |
| **服务端状态** | 来自后端的数据(列表、详情) | **TanStack Query(React Query)** —— SPA 场景 / 或 Server Components —— 框架场景 |
| **全局客户端状态** | 真正跨组件共享的客户端状态(主题、登录用户) | **Zustand**(轻量)/ Redux Toolkit(复杂) |

**最常见的错误:把服务端数据塞进全局 store**(Redux/Zustand)。服务端数据有缓存、重验证、加载/错误状态的需求,这些 TanStack Query(SPA)或 Server Components(框架)处理得专业得多。全局 store 只放**真正的客户端全局状态**。

```jsx
// SPA 里取服务端数据:用 TanStack Query,不要塞进 Redux
function Products() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["products"],
    queryFn: fetchProducts,
  });
  // 自动管理缓存、加载、错误、重新获取
}
```

## 3.7 组件与 Hook 模式

- **组合优于继承**:用 children、render props、组合小组件,别搞组件继承。
- **逻辑抽进自定义 hook**:可复用的有状态逻辑抽成 `useXxx`,组件保持简洁。
- **别过度抽象**(呼应第四册 9.6):不要为一次性的东西造抽象。AI 尤其爱过度工程,审查时砍掉多余的抽象。
- **"容器/展示组件"已过时**:那是 hooks 之前的模式,现在用 hook 分离逻辑即可,别再刻意分容器/展示。

## 3.8 让 AI 写出现代 React 的注意点

React 是 AI 容易给过时代码的另一个重灾区(知识可能停留在旧版本):

| AI 可能给的过时模式 | 现代做法 |
|---|---|
| `useEffect` 里取数 + loading state | Server Components(框架)/ TanStack Query(SPA) |
| 到处手动 useMemo/useCallback/memo | React Compiler 自动处理,别手动 |
| 把服务端数据塞 Redux | TanStack Query / Server Components |
| class 组件 | 函数组件 + hooks |
| 容器/展示组件刻意分层 | hook 分离逻辑 |
| CRA 起项目 | Vite / Next(第 1 章) |

**应对**:在 CLAUDE.md / AGENTS.md 里写明项目的现代约定(用 React 19、Compiler、TanStack Query、不手动 memo),让 AI 据此写。这正是第 4 章"让项目 AI 友好"的内容。

## 3.9 React 现代模式检查清单

- [ ] 框架场景:默认 Server Component,只在需交互时 `"use client"`
- [ ] 表单用 Actions + useActionState/useFormStatus/useOptimistic
- [ ] 用 React Compiler,不手动 useMemo/useCallback(除非实测需要)
- [ ] 状态三分法:本地用 useState、服务端用 TanStack Query/SC、全局用 Zustand
- [ ] 不把服务端数据塞全局 store
- [ ] 函数组件 + hooks,逻辑抽自定义 hook,别过度抽象
- [ ] CLAUDE.md 写明现代约定,防 AI 给过时代码

---

**本章数据来源(React 19 现状):**
- [React v19 官方博客](https://react.dev/blog/2024/12/05/react-19)
- [React 19 Complete Guide: Server Components & Actions (2026)](https://softaims.com/blog/react-19-server-components-actions-guide-2026)
- [React Stack Patterns (patterns.dev)](https://www.patterns.dev/react/react-2026/)

---

下一章：[04 · 让前端项目 AI 友好](04-让前端项目AI友好.md)
