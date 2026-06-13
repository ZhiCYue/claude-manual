# 第 1 章 · 第一个 MCP 服务器

理论够了，动手。这一章你会用 Python 官方 SDK 的 **FastMCP**，十几行写出一个能跑的服务器，并接进 Claude Code 实际调用它。

---

## 1.1 安装

官方 Python SDK 包名是 `mcp`，内含 FastMCP（高层封装，让你像写普通函数一样写服务器）。推荐用 `uv`（快速的 Python 包管理器）：

```bash
# 用 uv（官方推荐）
uv init weather
cd weather
uv add "mcp[cli]"

# 或者用 pip
pip install "mcp[cli]"
```

`[cli]` 这个 extra 装上了命令行工具，包括稍后调试用的 MCP Inspector。

## 1.2 十几行的天气服务器

新建 `weather.py`：

```python
from mcp.server.fastmcp import FastMCP

# 创建一个服务器，名字会显示在宿主里
mcp = FastMCP("weather")

@mcp.tool()
def get_forecast(city: str) -> str:
    """获取某个城市的天气预报。

    Args:
        city: 城市名，如 "Beijing"。
    """
    # 真实场景：调用气象 API
    return f"{city} 未来三天：晴，22–28°C。"

@mcp.tool()
def get_alerts(state: str) -> str:
    """获取某个州/省的天气预警。

    Args:
        state: 州或省的名称。
    """
    return f"{state} 当前无天气预警。"

if __name__ == "__main__":
    mcp.run()    # 默认用 stdio 传输
```

就这些。你已经有了一个暴露两个工具的 MCP 服务器。

## 1.3 这几行代码做了什么（原理）

回顾第 0 章，对照看 SDK 替你做了什么：

- **`FastMCP("weather")`** —— 创建服务器，"weather" 是它的名字，握手时报给客户端。
- **`@mcp.tool()`** —— 把一个普通函数注册成 MCP 工具。装饰器做三件关键的事：
  1. 把**函数名**变成工具名（`get_forecast`）。
  2. 把**类型注解**变成输入的 JSON Schema（`city: str` → `{"city": {"type": "string"}}`）。
  3. 把 **docstring** 变成工具说明，模型靠它决定何时、怎么调用。
- **`mcp.run()`** —— 启动服务器，默认用 stdio 传输（标准输入输出，本地进程间通信）。SDK 自动处理初始化握手、能力声明（"我有 tools 能力"）、`tools/list` 和 `tools/call` 的 JSON-RPC 往返。

> **第二条硬规则在这里第一次显形**：你写的类型注解和 docstring，**就是协议本身**。模型完全靠它们理解你的工具。`city: str` 写成 `city` 不带注解，schema 就缺类型；docstring 含糊，模型就乱调。**把它们当 API 文档来写。**

## 1.4 接进 Claude Code

让 Claude Code 连上你的服务器，一条命令：

```bash
claude mcp add weather -- uv --directory /绝对路径/到/weather run weather.py
```

`claude mcp add <名字> -- <启动命令>` 的意思是：注册一个叫 `weather` 的服务器，宿主通过运行后面那条命令来启动它。

> 用 `pip` 装的话启动命令就是 `python /路径/weather.py`；用 `uv` 则如上。`--directory` 指定项目目录。

然后在 Claude Code 会话里：

```
> 用 weather 工具查一下北京的天气预报
```

Claude 会发现你的 `get_forecast` 工具、调用它、把结果用进回答。会话里输入 `/mcp` 可以查看服务器连接状态和可用工具。

验证已连接：

```bash
claude mcp list      # 列出已配置的服务器及状态
```

## 1.5 接进 Claude 桌面端

桌面端通过配置文件 `claude_desktop_config.json` 接入。位置：

- **macOS**：`~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**：`%AppData%\Claude\claude_desktop_config.json`

文件不存在就创建它，在 `mcpServers` 键下加你的服务器：

```json
{
  "mcpServers": {
    "weather": {
      "command": "uv",
      "args": [
        "--directory",
        "/绝对路径/到/weather",
        "run",
        "weather.py"
      ]
    }
  }
}
```

要点：

- **必须用绝对路径**（`pwd` 拿到当前目录路径）。
- `command` 字段可能需要填 `uv` 可执行文件的**完整路径**（`which uv` 拿到）。Windows 上 JSON 里的路径用双反斜杠 `\\` 或正斜杠 `/`。
- 保存后**重启 Claude 桌面端**。至少配好一个服务器，桌面端才会显示 MCP 相关的 UI 元素。

第 6 章会讲接入更多宿主（API、Agent SDK、其他 IDE）。

## 1.6 用 Inspector 快速测试（不连宿主）

每次改完都去 Claude 里点一遍太慢。官方提供 **MCP Inspector**——一个本地调试 UI，直接连你的服务器，让你手动列出和调用工具：

```bash
# 用 cli 工具启动 Inspector 连上你的服务器
uv run mcp dev weather.py
```

它会打开一个网页，你能看到服务器声明的工具、手动填参数调用、看返回内容。**开发期主力调试手段**，第 7 章详谈。

## 1.7 用 TypeScript 写（等价版本）

如果你的栈是 Node，官方 TypeScript SDK 是 `@modelcontextprotocol/sdk`：

```bash
npm install @modelcontextprotocol/sdk zod
```

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({ name: "weather", version: "1.0.0" });

server.tool(
  "get_forecast",
  "获取某个城市的天气预报",
  { city: z.string().describe("城市名，如 Beijing") },
  async ({ city }) => ({
    content: [{ type: "text", text: `${city} 未来三天：晴，22–28°C。` }],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

概念完全一致：工具名、描述、用 Zod 定义的输入 schema、返回 content 数组。本册主体用 Python，TS 的关键差异在第 5、6 章会点出。

## 1.8 实战起步：把你的内部 API 封成工具

第一周的练习目标。假设你们有个内部工单系统，把"搜工单"封成 MCP 工具：

```python
from mcp.server.fastmcp import FastMCP
import httpx

mcp = FastMCP("tickets")

@mcp.tool()
async def search_tickets(keyword: str, status: str = "open") -> str:
    """搜索内部工单系统。

    Args:
        keyword: 搜索关键词。
        status: 工单状态，可选 open / closed / all，默认 open。
    """
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://tickets.internal.example.com/api/search",
            params={"q": keyword, "status": status},
            timeout=10,
        )
        return resp.text

if __name__ == "__main__":
    mcp.run()
```

注意工具函数可以是 `async def`——涉及网络/IO 时用异步，FastMCP 都支持。接进 Claude Code 后：

```
> 工单系统里搜一下"支付超时"相关的未关闭工单，挑出最紧急的三个
```

你的系统就这样接入了 Claude 生态。下一章深入工具的方方面面。

---

下一章：[02 · Tools 工具详解](02-Tools工具详解.md)
