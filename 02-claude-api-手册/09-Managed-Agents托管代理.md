# 第 9 章 · Managed Agents 托管代理（Beta）

第 8 章的 Agent SDK，循环和工具都跑在**你的机器**上。Managed Agents 更进一步：**Anthropic 跑 agent 循环，并为每个会话托管一个容器**——bash、文件操作、代码执行都在那个云端工作区里跑。你只管定义 agent、发消息、收事件。

这是三层架构里"第三层"的最省心实现。本章是 beta 功能的概览，深入细节请 WebFetch 官方文档。

---

## 9.1 架构：四个核心概念

```
                    ┌─────────────────────────────────────┐
                    │  Anthropic 编排层                     │
Agent（配置）───────▶│  （agent 循环：Claude + 工具调用）     │
                    └──────────────┬──────────────────────┘
                                   │ 工具调用
                                   ▼
Environment（模板）──▶ Container（工具执行的工作区）
                              │
                      Session ─┤
                              ├── Resources（文件、仓库、记忆库）
                              ├── Vault IDs（MCP 凭据引用）
                              └── 对话（事件流进出）
```

| 概念 | 端点 | 是什么 |
|---|---|---|
| **Agent** | `/v1/agents` | 持久化、有版本的配置：模型、系统提示、工具、MCP 服务器、skills。**会话前必须先创建。** |
| **Session** | `/v1/sessions` | 一次有状态的交互。引用一个已创建的 agent + 环境 + 初始指令。产出事件流。 |
| **Environment** | `/v1/environments` | 容器配置模板，可跨 agent 复用。 |
| **Container** | 无 | 隔离的计算实例，agent 的**工具**在这里执行。 |

## 9.2 强制流程：Agent（一次）→ Session（每次运行）

> ⚠️ **这是最容易搞错的地方。** `model`/`system`/`tools` 都在 **agent** 上，**不在 session 上**。每个 session 只引用一个预先创建的 agent。

| 步骤 | 调用 | 频率 |
|---|---|---|
| 1 | `agents.create()`——配置 model/system/tools | **一次**，存下 `agent.id` |
| 2 | `sessions.create()`——引用 agent | **每次运行** |

**为什么 agent 是独立对象：版本管理。** agent 是持久化、有版本的配置——每次更新创建一个新的不可变版本，session 在创建时锁定到某个版本。这让你能迭代 agent（改提示、加工具）而不破坏正在运行的 session，能回滚，能 A/B 测试。如果你每次运行都 `agents.create()`，这些全没了——还会积累一堆孤儿 agent 对象。

**正确形态**：创建一次 → 持久化 ID（配置文件/环境变量/数据库）→ 每次运行加载 ID 并 `sessions.create()`。

## 9.3 最小端到端示例（Python）

```python
import anthropic
client = anthropic.Anthropic()

# === 一次性设置（创建环境和 agent，存下 ID）===
environment = client.beta.environments.create(
    name="my-dev-env",
    config={"type": "cloud", "networking": {"type": "unrestricted"}},
)

agent = client.beta.agents.create(
    name="Coding Assistant",
    model="claude-opus-4-8",
    system="你是一个有用的编码 agent。",
    tools=[{"type": "agent_toolset_20260401"}],   # 全套内置工具
)
# 把 agent.id 和 environment.id 存起来，下次直接用

# === 每次运行（创建 session，引用 agent）===
session = client.beta.sessions.create(
    agent=agent.id,                      # 字符串简写 → 最新版本
    environment_id=environment.id,
    title="Hello World Session",
)
print(session.id, session.status)
```

## 9.4 收发事件

会话通过**事件流**通信。核心模式：**先开流，再发消息**（流只投递开流之后的事件；先发后开会丢失早期事件）。

```python
# 先开流
with client.beta.sessions.events.stream(session_id=session.id) as stream:
    # 流开着的时候发消息
    client.beta.sessions.events.send(
        session_id=session.id,
        events=[{"type": "user.message", "content": [{"type": "text", "text": "审查 auth 模块"}]}],
    )
    # 处理事件
    for event in stream:
        if event.type == "agent.message":
            for block in event.content:
                if block.type == "text":
                    print(block.text, end="", flush=True)
        elif event.type == "session.status_idle":
            # agent 完成当前任务，等待输入
            if event.stop_reason.type != "requires_action":
                break       # 正常完成
        elif event.type == "session.status_terminated":
            break
```

### 主要事件类型

| 事件 | 含义 |
|---|---|
| `agent.message` | agent 文本输出 |
| `agent.thinking` | 思考块 |
| `agent.tool_use` / `agent.tool_result` | 内置工具调用与结果 |
| `agent.custom_tool_use` | 调用了自定义工具——会话转 idle，你回 `user.custom_tool_result` |
| `session.status_idle` | agent 完成，等待输入（看 `stop_reason`） |
| `session.status_running` | agent 正在工作 |
| `session.status_terminated` | 会话终止（不可逆） |

> **正确的 idle 退出判断**：不要只看到 `session.status_idle` 就退出。会话会瞬时转 idle（如等待工具确认）。当 idle 且 `stop_reason.type` 是终止性的（`end_turn`/`retries_exhausted`），或 `session.status_terminated` 时才退出。`requires_action` 表示在等你——处理它，别退出。

## 9.5 会话生命周期

```
rescheduling → running ↔ idle → terminated
```

| 状态 | 描述 |
|---|---|
| `running` | agent 正在干活 |
| `idle` | 完成当前任务，等待输入（`stop_reason` 说明为什么停） |
| `rescheduling` | 可重试错误后正在重新调度 |
| `terminated` | 终止，不可逆 |

内置特性：上下文压缩、prompt caching、扩展思考（默认开，作为 `agent.thinking` 事件返回）都自动处理。

## 9.6 工具：三种

| 类型 | 谁执行 | 怎么用 |
|---|---|---|
| **预置 Claude Agent 工具**（`agent_toolset_20260401`） | Anthropic，在容器里 | bash、read、write、edit、glob、grep、web_fetch、web_search。一次全启用或逐个配置。 |
| **MCP 工具**（`mcp_toolset`） | Anthropic 编排层 | 连接的 MCP 服务器暴露的能力 |
| **自定义工具** | **你**——你的程序处理调用 | agent 发 `agent.custom_tool_use` 事件，会话转 idle，你回 `user.custom_tool_result` |

MCP 服务器的认证走 **vault**（保险库）：agent 的 `mcp_servers` 只声明 `{type, name, url}`（无认证），凭据存在 vault 里，session 通过 `vault_ids` 附加。Anthropic 自动刷新 OAuth token。

## 9.7 资源挂载

session 可挂载文件、GitHub 仓库、记忆库：

```python
session = client.beta.sessions.create(
    agent=agent.id,
    environment_id=environment.id,
    resources=[
        {
            "type": "github_repository",
            "url": "https://github.com/owner/repo",
            "authorization_token": os.environ["GITHUB_TOKEN"],
            "mount_path": "/workspace/repo",
            "checkout": {"type": "branch", "name": "main"},
        }
    ],
)
```

agent 可以读、改、提交、推送（通过 bash 的 git）。agent 写到 `/mnt/session/outputs/` 的文件会被自动捕获，会话结束后可通过 Files API 用 `scope_id=session.id` 列出和下载。

## 9.8 什么时候用 Managed Agents？

**用它**当你想要 Anthropic 跑循环**并**托管工具执行的容器——文件操作、bash、代码执行都在每会话工作区里跑。典型：

- 带工作区的有状态编码 agent（每个任务一个工作区）
- 长程研究 agent，把事件流推给 UI
- 持久化、有版本的 agent 配置，跨多会话复用

**不用它**（用第 4 章的 Tool Use 或第 8 章的 Agent SDK）当你想自己托管计算、跑自己的工具运行时。

**可用性**：第一方 API 和 Claude Platform on AWS 支持。Amazon Bedrock / Google Vertex AI / Microsoft Foundry **不支持**——那些平台上用 Claude API + Tool Use。

## 9.9 几个关键陷阱

- **Agent 先于 session，无例外**——session 的 `agent` 字段只接受字符串 ID 或 `{type, id, version}`。
- **Agent 创建一次，不是每次运行**——存下 `agent_id` 复用。
- **MCP 认证走 vault**，不放在 agent 配置里。
- **先开流再发消息**，否则丢早期事件。
- **Archive 是永久的**——归档 agent/environment/session 使其只读，无法撤销。别把归档当常规清理。

## 9.10 用 `ant` CLI 管理（推荐）

把 agent 和 environment 定义为 YAML，用 `ant` CLI 从版本控制应用——控制面用 CLI，数据面（session）用 SDK：

```yaml
# summarizer.agent.yaml
name: Summarizer
model: claude-sonnet-4-6
system: |
  你是一个写简洁摘要的助手。
tools:
  - type: agent_toolset_20260401
```

```bash
AGENT_ID=$(ant beta:agents create < summarizer.agent.yaml --transform id -r)
# CI 里更新：ant beta:agents update --agent-id "$AGENT_ID" --version 1 < summarizer.agent.yaml
```

深入细节（多 agent、记忆库、定时部署、webhook、自托管沙箱）请 WebFetch `https://platform.claude.com/docs/en/managed-agents/`。

---

最后一篇：[附录 · 速查与排错](附录-速查与排错.md)
