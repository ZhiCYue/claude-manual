# 第 8 章 · Agent SDK

第 4 章你手写了 Agent 循环。Agent SDK（`claude-agent-sdk`）是把 **Claude Code 的整个引擎**以库的形式开放——同样的 Agent Loop、工具、权限模型、子代理、Hooks，但宿主是**你的程序**。你不用重写 Claude Code 已经做好的一切。

---

## 8.1 它和 Messages API 的关系

| | Messages API（第 1–7 章） | Agent SDK（本章） |
|---|---|---|
| 抽象层级 | 一个端点，你拼装一切 | 一个完整的 agent 运行时 |
| Agent 循环 | 你自己写（第 4 章） | SDK 替你跑 |
| 内置工具 | 无（你定义） | 文件读写、bash、搜索等开箱即用 |
| 权限/Hooks | 自己实现 | 内置（同 Claude Code） |
| 适合 | 精确控制、轻量集成 | 想要 Claude Code 的能力但嵌进自己的产品 |

如果你读完第一册觉得"Claude Code 这套工作流太好用了，我想把它做进我的应用里"——Agent SDK 就是答案。

## 8.2 安装与最小示例

```bash
pip install claude-agent-sdk
```

```python
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions

async def main():
    options = ClaudeAgentOptions(
        system_prompt="你是一位专业的 Python 工程师",
        permission_mode="acceptEdits",
        cwd="/home/user/project",
    )

    async for message in query(prompt="创建一个 Python web 服务器", options=options):
        print(message)

asyncio.run(main())
```

`query()` 是一次性任务的入口：给一个 prompt，它跑完整个 agent 循环（读文件、写代码、跑命令、自我修正），把过程中的消息流式产出。

## 8.3 `ClaudeAgentOptions` 关键配置

这是控制 agent 行为的核心。最常用的字段：

```python
from claude_agent_sdk import ClaudeAgentOptions

options = ClaudeAgentOptions(
    # 工具与权限控制
    allowed_tools=["Read", "Edit", "Bash"],     # 允许的工具
    disallowed_tools=["WebFetch"],              # 禁止的工具
    permission_mode="acceptEdits",              # 权限模式（见下）

    # 提示与系统指令
    system_prompt="你是一个严谨的代码审查员",

    # MCP 服务器与自定义工具
    mcp_servers={"calc": calculator_server},

    # 对话控制
    max_turns=20,                # 限制循环轮数，防失控
    max_budget_usd=5.0,          # 花费上限
    continue_conversation=False, # 是否继续最近会话
    resume=None,                 # 恢复指定会话 ID

    # 环境
    cwd="/home/user/project",    # 工作目录
    add_dirs=["../shared-lib"],  # 额外可访问目录
    env={"NODE_ENV": "development"},

    # 设置加载（从哪些层级读 CLAUDE.md/settings）
    setting_sources=["project"], # ["user", "project", "local"] 或 [] 全禁用

    # 模型与推理
    model="claude-opus-4-8",
    thinking={"type": "adaptive", "display": "summarized"},
    effort="high",

    # Hooks（同第一册第 6 章）
    hooks=None,
)
```

### 权限模式

和第一册第 4 章的概念一致：

```python
permission_mode = (
    "default"            # 标准权限行为
    | "acceptEdits"      # 自动接受文件编辑
    | "plan"             # 计划模式：只探索不编辑
    | "dontAsk"          # 拒绝任何未预先批准的
    | "bypassPermissions" # 绕过权限检查（谨慎用）
)
```

### setting_sources

控制加载哪些配置（CLAUDE.md、settings.json）：

```python
ClaudeAgentOptions(setting_sources=["project"])  # 只加载项目设置（团队共享）
ClaudeAgentOptions(setting_sources=[])           # 禁用所有文件系统设置（隔离运行）
```

## 8.4 多轮对话：`ClaudeSDKClient`

`query()` 是一次性的。要跨多轮交互保持上下文，用 `ClaudeSDKClient`：

```python
from claude_agent_sdk import ClaudeSDKClient, AssistantMessage, TextBlock

async def main():
    async with ClaudeSDKClient() as client:
        # 第一个问题
        await client.query("法国的首都是哪里？")
        async for message in client.receive_response():
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        print(f"Claude: {block.text}")

        # 追问——会话保留之前的上下文
        await client.query("那座城市的人口是多少？")
        async for message in client.receive_response():
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        print(f"Claude: {block.text}")
```

### ClaudeSDKClient 主要方法

```python
async def connect(prompt=None)          # 建立连接
async def query(prompt)                 # 发送消息
async def receive_messages()            # 接收所有消息
async def receive_response()            # 接收一次完整响应
async def interrupt()                   # 中断当前操作
async def set_permission_mode(mode)     # 运行时改权限模式
async def set_model(model)              # 运行时换模型
async def disconnect()                  # 断开
```

`interrupt()` 和 `set_permission_mode()` 让你在 agent 运行中途介入——这正是第一册讲的 `Esc` 中断和 `Shift+Tab` 切模式的程序化版本。

## 8.5 自定义工具：`@tool` 装饰器

用 `@tool` 装饰器定义工具，再用 `create_sdk_mcp_server` 打包成进程内 MCP 服务器：

```python
from claude_agent_sdk import tool, create_sdk_mcp_server, ClaudeAgentOptions

@tool("add", "两数相加", {"a": float, "b": float})
async def add(args):
    return {"content": [{"type": "text", "text": f"和: {args['a'] + args['b']}"}]}

@tool("multiply", "两数相乘", {"a": float, "b": float})
async def multiply(args):
    return {"content": [{"type": "text", "text": f"积: {args['a'] * args['b']}"}]}

calculator = create_sdk_mcp_server(
    name="calculator",
    version="2.0.0",
    tools=[add, multiply],
)

options = ClaudeAgentOptions(
    mcp_servers={"calc": calculator},
    allowed_tools=["mcp__calc__add", "mcp__calc__multiply"],
)
```

注意工具名的格式：`mcp__<服务器名>__<工具名>`，和第一册第 7 章的 MCP 工具命名一致。

`@tool` 的参数：名字、描述、输入 schema（用类型字典）。也可加 `annotations=ToolAnnotations(readOnlyHint=True)` 标记只读工具，让 SDK 能并行调度。

## 8.6 返回的消息类型

迭代 `query()` 或 `receive_response()` 时，你会收到不同类型的消息对象：

```python
from claude_agent_sdk import AssistantMessage, TextBlock, ResultMessage

@dataclass
class AssistantMessage:
    content: list[ContentBlock]   # 内容块列表（TextBlock、ToolUseBlock 等）
    model: str
    usage: dict | None = None

@dataclass
class TextBlock:
    type: Literal["text"]
    text: str

@dataclass
class ResultMessage:               # 最终结果，循环结束时
    subtype: str                   # "success" / "error_during_execution" 等
    duration_ms: int
    is_error: bool
    num_turns: int
    session_id: str
    total_cost_usd: float | None   # 本次花了多少钱
    usage: dict | None             # token 用量
    result: str | None
```

典型处理模式：用 `isinstance` 判断类型，从 `AssistantMessage.content` 里取 `TextBlock`，从 `ResultMessage` 拿最终统计（成本、轮数、session_id）。

## 8.7 会话管理

```python
from claude_agent_sdk import list_sessions, get_session_messages, rename_session, tag_session

# 列出会话
sessions = list_sessions(directory="/path/to/project", limit=10)
for s in sessions:
    print(f"{s.summary} ({s.session_id})")

# 取某会话的消息
messages = get_session_messages(sessions[0].session_id)

# 重命名、打标签
rename_session(sessions[0].session_id, "重构认证模块")
tag_session(sessions[0].session_id, "需复审")
```

## 8.8 实战：一个有自定义工具的研究助手

把本章拼起来——一个能用自定义工具、跑多轮、有预算上限的 agent：

```python
import asyncio
from claude_agent_sdk import (
    ClaudeSDKClient, ClaudeAgentOptions, tool, create_sdk_mcp_server,
    AssistantMessage, TextBlock, ResultMessage,
)

@tool("search_docs", "在内部文档库搜索关键词", {"query": str})
async def search_docs(args):
    # 实际场景：查你的内部知识库
    results = my_internal_search(args["query"])
    return {"content": [{"type": "text", "text": results}]}

async def main():
    server = create_sdk_mcp_server(name="docs", version="1.0.0", tools=[search_docs])
    options = ClaudeAgentOptions(
        mcp_servers={"docs": server},
        allowed_tools=["mcp__docs__search_docs", "Read", "Write"],
        permission_mode="acceptEdits",
        model="claude-opus-4-8",
        max_turns=15,
        max_budget_usd=2.0,
    )

    async with ClaudeSDKClient(options=options) as client:
        await client.query("查一下我们的退款政策，整理成一页 FAQ 写入 faq.md")
        async for message in client.receive_response():
            if isinstance(message, AssistantMessage):
                for block in message.content:
                    if isinstance(block, TextBlock):
                        print(block.text, end="", flush=True)
            elif isinstance(message, ResultMessage):
                print(f"\n\n完成。花费 ${message.total_cost_usd:.4f}，{message.num_turns} 轮")

asyncio.run(main())
```

## 8.9 Agent SDK vs 自建循环 vs Managed Agents

| | 自建循环（第 4 章） | Agent SDK（本章） | Managed Agents（第 9 章） |
|---|---|---|---|
| 谁跑循环 | 你 | SDK（在你的进程里） | Anthropic（云端） |
| 内置工具 | 无 | 有（文件、bash 等） | 有（云端容器执行） |
| 计算在哪 | 你的机器 | 你的机器 | Anthropic 的容器 |
| 适合 | 精确控制 | 嵌入产品、要 Claude Code 能力 | 要托管、文件挂载、跨会话状态 |

---

下一章：[09 · Managed Agents 托管代理](09-Managed-Agents托管代理.md)
