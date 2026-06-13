# 项目记忆（CLAUDE.md）

> Claude Code 配置层。实质约定来自工具中立的 AGENTS.md，这里只放 Claude Code 特有的补充。
> 个人偏好不要写在这里（这是团队共享、进 git 的文件）——个人偏好放 `~/.claude/CLAUDE.md` 或 `CLAUDE.local.md`。

团队完整约定见 @AGENTS.md（分层规则、命令、风格、坑都在那）。

## Claude Code 特有补充

- 跑测试用 `make test`（不要直接 pytest，环境变量在 Makefile）
- 数据库迁移用 `make migrate`，不要手改 `migrations/` 下已有文件
- 改完 API 层，同步更新 `docs/api.md`
- 复杂改动先用 Plan Mode 出方案，审完再执行

## 提交前

- 必过 `make lint` 和 `make test`
- 自己完整过一遍 diff，你对提交的代码负全责
