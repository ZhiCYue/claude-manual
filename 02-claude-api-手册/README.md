# Claude API / Agent SDK 开发手册（第二册）

> 编写时间：2026-06，基于 Anthropic 官方 API 文档与 SDK（Python SDK `anthropic`、Agent SDK `claude-agent-sdk`）。
> 前置阅读：第一册《Claude Code 终端使用手册》（`../01-claude-code-手册/`）——尤其第 0 章的 Agent Loop 原理，本册大量内容是"亲手实现那个循环"。

## 这册讲什么

第一册你是 Claude Code 的**使用者**；这一册你成为**开发者**——直接调用 Claude 模型的能力，把它构建进你自己的程序和产品。

## 全书主线：三层架构

构建 LLM 应用有三个层级，**从最简单的层级开始，够用就别升级**：

```
第一层  单次调用        分类 / 摘要 / 提取 / 问答
        │              → Messages API 一问一答（第 1–3 章）
        ▼
第二层  工作流          多步骤流水线，你的代码控制流程
        │              → Messages API + Tool Use，你写循环（第 4–5 章）
        ▼
第三层  Agent          模型自主决定路径
                       → 自建循环（第 4 章）/ Agent SDK（第 8 章）/ Managed Agents（第 9 章）
```

## 目录

| 文件 | 内容 | 层级 |
|---|---|---|
| [00-总览-三层架构与模型选择.md](00-总览-三层架构与模型选择.md) | API 全景；模型目录与定价；如何选型 | 必读 |
| [01-Messages-API基础.md](01-Messages-API基础.md) | 客户端、基本请求、多轮对话、图片/PDF、错误处理 | 一 |
| [02-思考-Effort与结构化输出.md](02-思考-Effort与结构化输出.md) | adaptive thinking、effort 参数、JSON 结构化输出 | 一 |
| [03-Streaming流式输出.md](03-Streaming流式输出.md) | 流式 API、事件类型、最佳实践 | 一 |
| [04-Tool-Use构建Agent.md](04-Tool-Use构建Agent.md) | 工具定义、手写 Agent 循环、Tool Runner | 二/三 |
| [05-服务端工具.md](05-服务端工具.md) | 联网搜索、代码执行沙箱、记忆工具 | 二/三 |
| [06-Prompt-Caching.md](06-Prompt-Caching.md) | 前缀缓存原理、断点放置、省 90% 成本的方法 | 进阶 |
| [07-规模化-Batches-Files与长对话.md](07-规模化-Batches-Files与长对话.md) | 批处理半价、文件 API、服务端压缩 | 进阶 |
| [08-Agent-SDK.md](08-Agent-SDK.md) | 把 Claude Code 引擎嵌入你的程序 | 三 |
| [09-Managed-Agents托管代理.md](09-Managed-Agents托管代理.md) | Anthropic 托管的云端 Agent（beta） | 三 |
| [附录-速查与排错.md](附录-速查与排错.md) | 模型表、错误码、stop_reason、避坑清单 | 工具书 |

## 学习路径建议

```
第 1 周  00–03 章：跑通第一个 API 调用 → 流式聊天程序。
         练习：写一个命令行聊天工具（多轮 + 流式输出）
第 2 周  04 章：手写一遍 Agent 循环（这是全书最重要的一章）。
         练习：给聊天工具加 2 个自定义工具（查天气、算数）
第 3 周  05–07 章：成本与规模化。
         练习：给你的应用加上 prompt caching，用 /usage 数据验证命中率
第 4 周  08 或 09 章（按需选一）：构建真正的 Agent 产品
```

## 三个贯穿全书的硬规则

1. **模型 ID 必须用精确字符串**（如 `claude-opus-4-8`），不要自己拼接、不要加日期后缀——错了直接 404。完整表见第 0 章。
2. **API 是无状态的**——每次请求都要带上完整对话历史。所有"记忆""会话"都是在这之上构建的（第 1、7 章）。
3. **数 token 用 `count_tokens` 接口**，永远不要用 tiktoken（那是 OpenAI 的分词器，对 Claude 误差 15–20% 以上）。
