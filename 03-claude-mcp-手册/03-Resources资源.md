# 第 3 章 · Resources 资源

资源是 MCP 的第二种原语——**只读的数据源**。这一章讲资源和工具的本质区别、直接资源、带参数的资源模板、以及"什么该做成资源而非工具"。

---

## 3.1 资源是应用控制的

回顾第 0 章的控制模型：

- **工具**由**模型**控制——模型自己决定调用。
- **资源**由**应用**控制——宿主应用决定何时把哪些资源喂给模型。

资源是**被动的、只读的**数据：文件内容、数据库 schema、API 文档、配置。应用可以直接读取，自己决定怎么用——选相关的片段、用 embedding 搜索、或全量喂给模型。

> **工具 vs 资源，一句话区分**：要让模型**做动作**（可能有副作用）→ 工具；要给模型**提供只读上下文**→ 资源。"查询数据库并返回结果"可以是工具；"暴露数据库的 schema 供参考"是资源。

每个资源有唯一的 **URI**（如 `file:///path/to/doc.md`）和 MIME 类型。

## 3.2 直接资源（固定 URI）

最简单的资源——一个固定 URI 指向特定数据。用 `@mcp.resource(uri)`：

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("docs")

@mcp.resource("config://app-settings")
def get_settings() -> str:
    """当前应用配置。"""
    return open("/app/config.yaml").read()

@mcp.resource("schema://database")
def get_db_schema() -> str:
    """数据库的表结构定义。"""
    return run_query("SELECT ... information_schema ...")
```

装饰器参数就是这个资源的 URI。函数返回资源内容。客户端用 `resources/list` 发现它、`resources/read` 读取它。

在宿主里，资源通常呈现为可以 `@` 引用的东西。比如 Claude Code 里输入 `@` 时，MCP 资源会出现在补全列表里。

## 3.3 资源模板（带参数的动态 URI）

固定 URI 不够时，用**资源模板**——URI 里带参数，支持灵活查询。URI 模板里用 `{参数名}`：

```python
@mcp.resource("weather://forecast/{city}")
def weather_forecast(city: str) -> str:
    """某城市的天气预报。"""
    return fetch_forecast(city)

@mcp.resource("users://{user_id}/profile")
def user_profile(user_id: str) -> str:
    """某用户的资料。"""
    return json.dumps(db.get_user(user_id))

@mcp.resource("travel://activities/{city}/{category}")
def activities(city: str, category: str) -> str:
    """某城市某类别的活动。"""
    return fetch_activities(city, category)
```

URI 里的 `{city}`、`{user_id}` 会作为函数参数传入。这样一个模板能服务无数具体查询：

- `weather://forecast/{city}` → `weather://forecast/Beijing`、`weather://forecast/Paris`……
- `travel://activities/{city}/{category}` → `travel://activities/barcelona/museums`

模板本身带元数据（标题、描述、MIME 类型），所以是**可发现、自描述**的。客户端用 `resources/templates/list` 发现模板。

## 3.4 两种资源发现模式对比

| | 直接资源 | 资源模板 |
|---|---|---|
| URI | 固定（`config://app-settings`） | 带参数（`weather://forecast/{city}`） |
| 发现方法 | `resources/list` | `resources/templates/list` |
| 适合 | 单一确定的数据源 | 一类参数化的查询 |
| 例子 | 应用配置、当前 schema | 按 ID 查用户、按城市查天气 |

## 3.5 参数补全

资源模板支持参数补全——帮用户发现合法的参数值，不必知道精确格式。比如：

- `weather://forecast/{city}` 里输入 "Par" → 提示 "Paris" 或 "Park City"
- `flights://search/{airport}` 里输入 "JFK" → 提示 "JFK - John F. Kennedy International"

FastMCP 中可以为模板参数提供补全逻辑（高级用法，需要时查官方文档）。

## 3.6 MIME 类型

资源声明自己的 MIME 类型，让客户端正确处理内容：

```python
@mcp.resource("report://latest", mime_type="application/json")
def latest_report() -> str:
    return json.dumps(generate_report())

@mcp.resource("logo://company", mime_type="image/png")
def company_logo() -> bytes:
    return open("logo.png", "rb").read()
```

文本返回字符串，二进制返回 bytes。MIME 类型帮宿主决定怎么渲染（JSON 格式化、图片显示等）。

## 3.7 什么时候用资源，什么时候用工具？

这是设计 MCP 服务器最常见的纠结。判断清单：

| 信号 | 倾向 |
|---|---|
| 只读、提供上下文 | 资源 |
| 有副作用（写、删、发送） | 工具 |
| 应该由应用/用户决定何时引入 | 资源 |
| 应该由模型根据对话自主决定调用 | 工具 |
| 像"一份文档""一份配置""一条记录" | 资源 |
| 像"一个操作""一次查询""一个动作" | 工具 |

**灰色地带的实用建议**：

- "数据库 schema" → 资源（只读上下文，应用决定何时给模型看）。
- "执行一条 SQL 查询" → 工具（模型主动发起的动作，且可能慢、可能有副作用）。
- "读取某个文件" → 可以是资源（`file://` URI）也可以是工具（`read_file(path)`）。如果希望模型主动按需读，做成工具；如果希望应用/用户挑选文件加入上下文，做成资源。

> **一个常见误区**：很多人把所有东西都做成工具，因为工具最直观。但只读上下文做成资源更合适——它让宿主和用户对"喂什么进上下文"有控制权，而不是依赖模型主动去调一个 `get_xxx` 工具。

## 3.8 实战：暴露一份配置和一类记录

把第 1 章的工单服务器加上资源——暴露工单系统的字段定义（直接资源）和按 ID 查工单（资源模板）：

```python
from mcp.server.fastmcp import FastMCP
import json, httpx

mcp = FastMCP("tickets")

@mcp.resource("tickets://schema")
def ticket_schema() -> str:
    """工单对象的字段定义——供模型理解工单结构。"""
    return json.dumps({
        "fields": {
            "id": "int", "title": "str", "status": "open|in_progress|closed",
            "priority": "low|medium|high", "assignee": "str (email)",
        }
    }, ensure_ascii=False)

@mcp.resource("tickets://{ticket_id}")
def get_ticket(ticket_id: str) -> str:
    """按 ID 获取单个工单的完整内容。"""
    resp = httpx.get(f"https://tickets.internal.example.com/api/tickets/{ticket_id}", timeout=10)
    return resp.text

# 工具仍然保留（第 1 章的 search_tickets）——动作用工具，只读上下文用资源

if __name__ == "__main__":
    mcp.run()
```

现在模型既能用资源理解工单的字段结构、用 `@tickets://1234` 引用具体工单，又能用工具主动搜索。三种能力各司其职。

---

下一章：[04 · Prompts 提示词](04-Prompts提示词.md)
