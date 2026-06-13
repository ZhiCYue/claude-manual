# 第 7 章 · MCP：连接外部世界

## 7.1 是什么、为什么

MCP（Model Context Protocol，模型上下文协议）是 Anthropic 发起的开放协议，现已成为行业标准。它解决的问题：**如何让 AI 以统一的方式接入任意外部系统**——数据库、浏览器、Slack、Jira、监控平台、你公司的内部 API。

> **原理**：回顾 0.5 节，模型的能力边界 = 它能调用的工具集合。MCP 服务器是一个独立小程序，启动时向 Claude Code **声明**自己提供哪些工具（名称、用途、参数 schema）。harness 把这些声明并入模型可见的工具列表；模型调用时，harness 把请求转发给 MCP 服务器执行并取回结果。
>
> 本质：**给 Agent Loop 设计了标准化的工具插槽**。任何人按协议写一个服务器，全世界的 MCP 客户端（Claude Code、Claude 桌面端、各种 IDE）都能即插即用。

两种传输方式：

| 传输 | 形态 | 例子 |
|---|---|---|
| **stdio** | 本地子进程，通过标准输入输出通信 | 操作本地浏览器、读本地数据库 |
| **HTTP (SSE)** | 远程服务，支持 OAuth 授权 | Sentry、GitHub、各种 SaaS 官方服务 |

## 7.2 接入与管理

```bash
# 本地 stdio 服务器：claude mcp add <名字> -- <启动命令>
claude mcp add playwright -- npx @playwright/mcp@latest

# 远程 HTTP 服务器
claude mcp add --transport http sentry https://mcp.sentry.dev/mcp

# 带环境变量（如数据库连接串）
claude mcp add --env DATABASE_URL="postgresql://localhost/mydb" \
  postgres -- npx @modelcontextprotocol/server-postgres

# 管理
claude mcp list        # 列出已配置的服务器及连接状态
claude mcp get <名字>   # 查看详情
claude mcp remove <名字>
```

会话内：`/mcp` 查看状态、对需要 OAuth 的远程服务完成浏览器授权。

### 作用域（--scope）

| 值 | 配置存哪 | 谁能用 |
|---|---|---|
| `local`（默认） | 个人配置 | 仅你、仅本项目 |
| `project` | 项目根 `.mcp.json`（进 git） | 全团队 |
| `user` | 用户全局配置 | 你的所有项目 |

团队共享的 `.mcp.json` 长这样：

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"]
    },
    "postgres-readonly": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-postgres"],
      "env": { "DATABASE_URL": "${DB_URL_READONLY}" }
    }
  }
}
```

（`${变量}` 引用环境变量，避免把密钥提交进 git。）

## 7.3 实战一：Playwright 浏览器自动化

这是最值得最先接入的 MCP——它让 Claude 能**亲眼验证**自己写的前端代码：

```bash
claude mcp add playwright -- npx @playwright/mcp@latest
```

```
> 实现购物车页面的"优惠券输入框"功能，写完后：
  打开 localhost:3000/cart，实际输入测试券码 TEST10，
  截图确认折扣金额显示正确
```

Claude 会驱动真实浏览器：导航 → 点击 → 填表 → 截图 → **看截图**判断结果 → 不对就改代码再来。前端开发的闭环从"我写完了（自我感觉）"升级为"我看到它工作了（亲眼验证）"。

## 7.4 实战二：直连数据库做数据分析

```bash
claude mcp add --env DATABASE_URL="postgresql://readonly@localhost/shop" \
  db -- npx @modelcontextprotocol/server-postgres
```

```
> 查一下过去 30 天每天的订单量和退款率，找出异常的日子，
  结合代码仓库里的发布记录（git log）分析可能的原因
```

注意这个例子的厉害之处：它把「数据库里的业务数据」和「代码仓库的变更历史」**两个世界联了起来**——这是单独的 BI 工具或单独的 IDE 都做不到的。

**安全要点**：给 AI 用的数据库连接一律用**只读账号**。深度防御，不要指望提示词约束。

## 7.5 实战三：用 Python 写一个自己的 MCP 服务器

公司内部系统没有现成 MCP？自己写一个只要 20 行。以"查询内部工单系统"为例：

```bash
pip install "mcp[cli]"      # 官方 Python SDK
```

`ticket_server.py`：

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("ticket-system")

@mcp.tool()
def search_tickets(keyword: str, status: str = "open") -> str:
    """搜索内部工单。status 可选 open/closed/all。"""
    # 实际场景：调用你们内部系统的 API
    import requests
    r = requests.get(
        "https://tickets.internal.example.com/api/search",
        params={"q": keyword, "status": status},
        timeout=10,
    )
    return r.text

@mcp.tool()
def get_ticket_detail(ticket_id: int) -> str:
    """获取指定工单的完整内容（含评论）。"""
    import requests
    r = requests.get(
        f"https://tickets.internal.example.com/api/tickets/{ticket_id}",
        timeout=10,
    )
    return r.text

if __name__ == "__main__":
    mcp.run()      # 默认 stdio 传输
```

接入并使用：

```bash
claude mcp add tickets -- python /path/to/ticket_server.py
```

```
> 搜一下工单系统里关于"支付超时"的未关闭工单，
  挑出和我们这个仓库代码相关的，逐个分析根因并给出修复计划
```

> **原理细节**：`@mcp.tool()` 装饰器做了三件事——把函数名变成工具名、把**docstring 变成工具说明**、把**类型注解变成参数 schema**。模型完全靠这些文本决定"何时调用、怎么传参"，所以 docstring 要像写给新同事一样清楚，这直接决定工具的"易用性"。

## 7.6 MCP 的另外两种资源

除了工具（tools），MCP 服务器还可以提供：

- **资源（resources）**：可被 `@` 引用的数据源。会话中输入 `@` 时，MCP 资源会出现在补全列表里（如 `@db:schema://orders`）。
- **提示词（prompts）**：会暴露为斜杠命令，格式 `/mcp__服务器名__提示词名`。

## 7.7 成本与安全守则

1. **每个 MCP 工具的声明都常驻上下文**。装 5 个大型服务器可能吃掉 2–3 万 token。用 `/context` 检查"MCP tools"占用，**只装当前真正在用的**。
2. **第三方 MCP = 给 AI 开新权限**。装之前问自己：这个服务器的作者可信吗？它的工具会不会返回恶意构造的内容（提示词注入）？
3. 对能"写"外部系统的工具（发消息、建工单、删数据），用 4.2 节的权限规则限制：
   ```json
   "allow": ["mcp__tickets__search_tickets", "mcp__tickets__get_ticket_detail"],
   "ask":   ["mcp__github__create_issue"],
   "deny":  ["mcp__db__execute_write"]
   ```

---

下一章：[08 · 子代理 Subagents](08-子代理Subagents.md)
