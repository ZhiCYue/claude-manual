# 项目约定（AGENTS.md）

> 这是本项目团队约定的**唯一来源**，工具中立。所有 AI 工具的配置应引用本文件而非另立一份：
> - Claude Code 的 `CLAUDE.md` 用 `@AGENTS.md` 导入
> - Cursor 的 `.cursorrules` 引用或粘贴本文件要点
> - 不用 AI 工具的成员直接阅读本文件
>
> 改约定只改这一处，所有工具同步。

## 项目是什么

（一句话说明项目用途。例：订单服务，处理下单、支付、退款。）

## 常用命令

| 做什么 | 命令 |
|---|---|
| 启动开发环境 | `make dev` |
| 跑全量测试 | `make test` |
| 代码检查 | `make lint` |
| 类型检查 | `make typecheck` |
| 数据库迁移 | `make migrate` |

> 跑测试用 `make test`，不要直接 `pytest`——环境变量在 Makefile 里。

## 架构与分层规则

- 分层：`src/api/`（路由）→ `src/services/`（业务）→ `src/repos/`（数据访问）
- **禁止跨层调用**：api 层不写业务逻辑，业务层不直接访问数据库
- 时间一律 UTC，存储为 ISO 8601 字符串
- 改动对外接口必须同步更新 `docs/api.md`

## 代码风格

- 新代码必须有类型注解
- 函数尽量短小、单一职责
- 命名清晰，避免缩写和黑话
- 提交前必过 `make lint`（git pre-commit hook 会自动跑）

## 已知的坑

- `tests/integration/` 依赖本地 Redis，没起 Redis 会大面积超时而非报连接错误
- `migrations/` 下已有的迁移文件不要手改，新增迁移用 `make migrate`
- （补充你项目特有的坑……）

## AI 生成代码的约定

- 你提交的任何代码，无论是否 AI 生成，你都对它负全责
- AI 生成的代码与手写代码走相同的审查和测试流程，不享受豁免
- 提交前你必须完整理解每一行——无法解释的代码不要提交
- 详见 [CONTRIBUTING.md](CONTRIBUTING.md) 的协作规范
