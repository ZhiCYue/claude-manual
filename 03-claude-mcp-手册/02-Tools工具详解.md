# 第 2 章 · Tools 工具详解

工具是 MCP 最常用的原语——**模型能主动调用的函数**。这一章把工具讲透：参数类型、返回内容、错误处理、以及"什么该做成工具"的设计判断。

---

## 2.1 工具是模型控制的

回顾第 0 章的控制模型：**工具由模型控制**。模型根据对话上下文，自己决定何时调用哪个工具、传什么参数。你定义工具，模型决定用不用。

这意味着两件事：

1. **工具的描述决定它被怎么用。** 模型看不到你的实现，只看到名字、描述、参数 schema。这些文本写得好不好，直接决定模型调用得对不对。
2. **工具可能有副作用，需要用户同意。** 工具能改数据库、发消息、删文件——所以 MCP 强调宿主应在执行前征得用户许可（审批弹窗、权限设置等）。

## 2.2 参数类型与 Schema

FastMCP 从你的类型注解自动生成 JSON Schema。常见类型：

```python
from mcp.server.fastmcp import FastMCP
from typing import Optional

mcp = FastMCP("demo")

@mcp.tool()
def create_event(
    title: str,                          # 必填字符串
    duration_minutes: int,               # 必填整数
    attendees: list[str],                # 字符串列表
    is_urgent: bool = False,             # 可选布尔，有默认值
    location: Optional[str] = None,      # 可选，可为空
) -> str:
    """创建一个日历事件。

    Args:
        title: 事件标题。
        duration_minutes: 时长（分钟）。
        attendees: 参与者邮箱列表。
        is_urgent: 是否紧急，默认否。
        location: 地点，可选。
    """
    return f"已创建：{title}（{duration_minutes} 分钟，{len(attendees)} 人）"
```

规则：

- **有默认值的参数 = 可选**；无默认值 = 必填（进 schema 的 `required`）。
- 用 `enum` 限定取值时，可以用 `Literal`：

```python
from typing import Literal

@mcp.tool()
def set_priority(level: Literal["low", "medium", "high"]) -> str:
    """设置优先级。"""
    return f"优先级设为 {level}"
```

模型只会从 `low`/`medium`/`high` 里选——`Literal` 变成 schema 里的 `enum`。

## 2.3 返回内容：content 数组

回顾第 0 章 0.7 节：工具返回的是一个 **content 数组**，支持多种内容类型。FastMCP 让简单情况变简单——直接 `return` 一个字符串，SDK 自动包成 `[{"type": "text", "text": "..."}]`：

```python
@mcp.tool()
def simple() -> str:
    return "这会被自动包成 text 内容块"
```

需要返回更丰富的内容（图片、多块），返回完整结构：

```python
@mcp.tool()
def get_chart() -> dict:
    """生成一张图表。"""
    return {
        "content": [
            {"type": "text", "text": "这是上季度销售图："},
            {"type": "image", "data": base64_png, "mimeType": "image/png"},
        ]
    }
```

返回结构化数据（让模型解析）时，返回 JSON 字符串是常见做法：

```python
import json

@mcp.tool()
def get_user(user_id: int) -> str:
    """按 ID 获取用户信息。"""
    user = db.fetch_user(user_id)
    return json.dumps(user, ensure_ascii=False)
```

## 2.4 错误处理

工具执行失败时，**抛异常或返回错误信息**，让模型知道出了什么问题、好调整策略。FastMCP 会把异常转成工具错误返回给模型：

```python
@mcp.tool()
def divide(a: float, b: float) -> str:
    """两数相除。"""
    if b == 0:
        raise ValueError("除数不能为 0，请提供非零的 b。")
    return str(a / b)
```

模型收到这个错误信息后，通常会道歉并换个方法或问用户澄清。**给出有用的错误信息**（"地点 xyz 找不到，请提供有效城市名"）比沉默失败或抛裸异常好得多。

> 呼应第二册第 4 章的 `is_error` 机制——MCP 工具的错误最终也会变成模型上下文里的工具结果，让循环能自我修正。

## 2.5 异步工具

涉及网络、数据库、文件 IO 时用 `async def`，避免阻塞：

```python
import httpx

@mcp.tool()
async def fetch_weather(city: str) -> str:
    """从气象 API 获取天气。"""
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"https://api.weather.example/v1/{city}", timeout=10)
        return resp.text
```

FastMCP 同时支持同步和异步工具，混用没问题。CPU 密集的同步工作放同步函数，IO 密集的放异步。

## 2.6 写好工具描述（最重要的事）

再强调一次第二条硬规则：**模型完全靠描述决定怎么用工具**。写好描述有具体技巧：

### 名字要具体

```python
# ❌ 太泛
@mcp.tool()
def search(q: str): ...

# ✅ 明确
@mcp.tool()
def search_customer_orders(customer_id: str): ...
```

### 描述要说清"何时用"，不只"是什么"

模型靠描述判断什么时候该调这个工具。明确写出触发条件：

```python
@mcp.tool()
def get_exchange_rate(from_currency: str, to_currency: str) -> str:
    """获取两种货币之间的实时汇率。

    当用户询问货币兑换、汇率、或需要把一种货币的金额换算成
    另一种时，调用此工具。不要用记忆中的汇率回答——汇率实时变动。

    Args:
        from_currency: 源货币代码，如 "USD"。
        to_currency: 目标货币代码，如 "CNY"。
    """
    ...
```

"当用户……时调用此工具"这种触发条件描述，在较新的模型上能显著提升正确调用率。

### 每个参数都写 description

`Args:` 里每个参数一句话，给出格式和示例（`如 "USD"`）。模型靠它构造正确的参数。

## 2.7 工具设计原则

呼应第二册第 4.8 节的"工具表面设计"。把能力做成工具时的判断：

**一个工具做一件事。** 别做一个 `manage_user(action, ...)` 万能工具，拆成 `create_user` / `update_user` / `delete_user`。清晰的边界让模型用得准，也让宿主能对危险操作（删除）单独门控。

**工具数量要克制。** 工具太多会让模型困惑，也占用上下文（每个工具的 schema 都常驻）。保持工具集聚焦。工具库很大时，用 Tool Search（动态发现）而非全部塞进去。

**危险操作要可门控。** 把"发邮件""删数据"做成独立的专门工具（而非藏在一个通用 `execute` 工具里），宿主才能对它弹审批框。可逆性是个好标准——难撤销的操作单独成工具。

**输入要验证。** 工具在你的机器上执行，模型传来的参数要当作不可信输入验证：

```python
@mcp.tool()
def read_file(path: str) -> str:
    """读取项目内的文件。"""
    import os
    # 防目录穿越：限制在允许的目录内
    safe_root = "/app/data"
    full = os.path.realpath(os.path.join(safe_root, path))
    if not full.startswith(safe_root):
        raise ValueError("不允许访问该路径")
    return open(full).read()
```

安全是第 7 章的主题，但这个意识从写第一个工具就要有。

## 2.8 工具注解（可选元数据）

可以给工具加注解，帮助宿主优化调度。比如标记只读工具（宿主可以并行调用、不必弹审批）：

```python
@mcp.tool(annotations={"readOnlyHint": True})
def list_files(directory: str) -> str:
    """列出目录下的文件（只读）。"""
    ...
```

常见注解：`readOnlyHint`（只读，无副作用）、`destructiveHint`（破坏性操作）、`idempotentHint`（幂等）。宿主据此决定 UI 和调度策略——比如对 `destructiveHint` 的工具强制弹确认框。

## 2.9 端到端实战：一个工具从写到测到接入，完整走一遍

前面的代码是分散的片段。这一节把一个**真实工具**从零做到能在 Claude Code 里用——写代码、用 Inspector 测、接入宿主、验证——一条龙跟着做。做完你就有了一套可复制到任何工具的工作流。

我们做一个**汇率换算工具**（比"hello world"实用，又不需要真实 API key——用一份内置汇率表，你之后换成真实 API 即可）。

> 👉 **可直接运行的完整文件**：[`示例代码/currency.py`](示例代码/currency.py)（`pip install "mcp[cli]"` 后即可按下面五步走查）。

### 第 1 步：写工具

新建目录和 `currency.py`：

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("currency")

# 简化：内置汇率表（真实场景换成调汇率 API）
_RATES = {"USD": 1.0, "CNY": 7.2, "EUR": 0.92, "JPY": 150.0}

@mcp.tool()
def convert(amount: float, from_currency: str, to_currency: str) -> str:
    """把一笔金额从一种货币换算成另一种。

    当用户需要货币兑换、汇率换算时调用。支持 USD/CNY/EUR/JPY。

    Args:
        amount: 金额，如 100。
        from_currency: 源货币代码，如 "USD"。
        to_currency: 目标货币代码，如 "CNY"。
    """
    f, t = from_currency.upper(), to_currency.upper()
    if f not in _RATES or t not in _RATES:
        raise ValueError(f"不支持的货币，仅支持 {list(_RATES)}")
    result = amount / _RATES[f] * _RATES[t]
    return f"{amount} {f} = {result:.2f} {t}"

if __name__ == "__main__":
    mcp.run()
```

注意这个工具用足了 2.2–2.6 的原则：类型注解生成 schema、docstring 写清"何时用"、`Args` 逐参数说明、错误处理给出有用信息（列出支持的货币）。

### 第 2 步：用 Inspector 测（连宿主之前）

别急着接 Claude Code——先用 Inspector 单独测，快得多（呼应第 7 章）：

```bash
uv run mcp dev currency.py
```

它打开一个网页。在里面：

1. 看 **Tools 列表**——确认 `convert` 出现了，schema 里有 `amount`/`from_currency`/`to_currency` 三个参数（验证装饰器和类型注解生效）。
2. **手动调用**：填 `amount=100, from_currency=USD, to_currency=CNY`，点调用，应返回 `100.0 USD = 720.00 CNY`。
3. **测错误路径**：填 `to_currency=XXX`，应返回"不支持的货币"的错误——验证你的错误处理。

这一步抓住 90% 的问题（schema 错、逻辑错、错误处理缺失），全程不用碰 Claude。

### 第 3 步：接入 Claude Code

Inspector 里没问题了，接进宿主：

```bash
claude mcp add currency -- uv --directory /绝对路径/到/currency run currency.py
claude mcp list      # 确认状态是已连接
```

> 路径必须是绝对路径（`pwd` 拿到）。用 pip 装的话启动命令是 `python /路径/currency.py`。

### 第 4 步：在真实对话里验证

进 Claude Code 会话：

```
> 5000 日元大概是多少人民币？
```

Claude 会发现 `convert` 工具、调用它（日元→人民币）、把结果用进回答。会话里 `/mcp` 能看到 `currency` 服务器和它的工具。

### 第 5 步：迭代

发现 Claude 用得不对？回到这个循环：

```
改 currency.py → Inspector 重测 → （满意后）Claude 里验证
```

比如你发现 Claude 有时不确定支持哪些货币——那就在 docstring 里把"支持 USD/CNY/EUR/JPY"写得更显眼，或加一个 `list_currencies` 工具。**改描述 → Inspector 验证 → 真实对话确认**，这个循环是 MCP 开发的日常。

### 这套工作流的要点

这五步是**任何 MCP 工具的标准开发流程**，记住它：

```
写（类型注解+docstring+错误处理）
  → Inspector 测（抓 90% 问题，不连宿主）
    → 接入（claude mcp add，绝对路径）
      → 真实对话验证
        → 迭代（改描述/逻辑，回到 Inspector）
```

**为什么先 Inspector 后宿主**：Inspector 直连服务器、手动调用、看原始返回——定位问题比"在对话里反复试探"快一个数量级。养成"先 Inspector"的习惯（第 7 章会再强调）。

**练习**：把 `_RATES` 换成真实的汇率 API（用 `httpx` 异步调一个免费汇率接口，工具改成 `async def`，见 2.5 节）。然后想一个安全问题：如果汇率 API 需要 key，这个 key 该放哪？（提示：第 7 章——从环境变量读，绝不写进 docstring 或返回值。）

---

下一章：[03 · Resources 资源](03-Resources资源.md)
