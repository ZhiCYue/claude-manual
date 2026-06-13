# 第 4 章 · Tool Use：构建 Agent

这是全册最重要的一章。第一册的 Agent Loop 原理，在这里变成你亲手写的代码。学完这章，你就能让 Claude 调用你定义的任何能力——查数据库、调 API、操作文件——并自主循环直到完成目标。

---

## 4.1 工具调用的本质（回顾原理）

回顾第一册第 0 章：模型本身只会"说话"。所谓"工具调用"，是模型输出一个结构化的请求——「我想调用 `get_weather`，参数是 `{location: "Paris"}`」——然后**你的代码**真正执行它，把结果喂回去。模型从不直接碰你的系统。

一次工具调用的完整往返：

```
1. 你发请求，附上工具定义（tools 参数）
2. 模型回复 stop_reason="tool_use"，content 里有 tool_use 块
3. 你执行该工具，得到结果
4. 你把结果作为 tool_result 发回（带上历史）
5. 模型基于结果继续——可能再调工具，可能给出最终答案
```

## 4.2 定义一个工具

工具定义是一段 JSON：名字、描述、输入的 JSON Schema。

```python
tools = [
    {
        "name": "get_weather",
        "description": "获取某地的当前天气",
        "input_schema": {
            "type": "object",
            "properties": {
                "location": {
                    "type": "string",
                    "description": "城市名，如 'San Francisco, CA'",
                },
                "unit": {
                    "type": "string",
                    "enum": ["celsius", "fahrenheit"],
                    "description": "温度单位",
                },
            },
            "required": ["location"],
        },
    }
]
```

> **写好工具定义的关键**：`description` 决定模型何时、如何调用这个工具。**要明确说清"什么时候调用"，不只是"它做什么"**——比如"当用户询问当前价格或最近事件时调用此工具"。在较新的 Opus 模型上，这种触发条件描述能显著提升正确调用率。每个参数也都要写 `description`，固定取值用 `enum`。

## 4.3 手写 Agent 循环（核心）

这是你必须理解的代码。它适用于需要精细控制的场景——自定义日志、条件执行、人在回路审批。

```python
import anthropic

client = anthropic.Anthropic()

def execute_tool(name, tool_input):
    """你的工具实现——这里只是示例。"""
    if name == "get_weather":
        return f"{tool_input['location']} 当前晴，22°C"
    return "未知工具"

tools = [ ... ]   # 4.2 节的工具定义

messages = [{"role": "user", "content": "巴黎和伦敦的天气怎么样？"}]

# Agent 循环：一直转，直到模型不再要求调工具
while True:
    response = client.messages.create(
        model="claude-opus-4-8",
        max_tokens=4096,
        tools=tools,
        messages=messages,
    )

    # 模型说完了（不再调工具），退出
    if response.stop_reason == "end_turn":
        break

    # 把模型这一轮的回复（含 tool_use 块）追加进历史 —— 关键，别漏
    messages.append({"role": "assistant", "content": response.content})

    # 取出所有工具调用请求
    tool_use_blocks = [b for b in response.content if b.type == "tool_use"]

    # 逐个执行，收集结果
    tool_results = []
    for tool in tool_use_blocks:
        result = execute_tool(tool.name, tool.input)
        tool_results.append({
            "type": "tool_result",
            "tool_use_id": tool.id,    # 必须匹配 tool_use 块的 id
            "content": result,
        })

    # 把工具结果作为一条 user 消息追加进历史
    messages.append({"role": "user", "content": tool_results})

# 最终回复文本
final_text = next(b.text for b in response.content if b.type == "text")
print(final_text)
```

**四个必须记住的点**：

1. **每轮把模型的完整 `response.content` 追加进 `messages`**——包括 `tool_use` 块。漏了它，模型就不知道自己刚才请求了什么。
2. **每个 `tool_result` 的 `tool_use_id` 必须匹配对应的 `tool_use` 块的 `id`**。
3. **工具结果放在 `user` 角色的消息里**。模型一轮可能请求多个工具，把所有结果放进同一条 user 消息。
4. **循环终止条件是 `stop_reason == "end_turn"`**——模型自己决定不再需要工具时。

> **务必亲手敲一遍这个循环。** 它是所有 Agent 的骨架。Agent SDK（第 8 章）和 Managed Agents（第 9 章）都是在替你跑这个循环——但你得先懂它本身。

## 4.4 处理工具执行错误

工具失败时，设 `is_error: True` 并给出有用的错误信息。模型会据此调整策略或换方法：

```python
tool_results.append({
    "type": "tool_result",
    "tool_use_id": tool.id,
    "content": "错误：找不到地点 'xyz'。请提供有效的城市名。",
    "is_error": True,
})
```

## 4.5 处理 `pause_turn`（服务端工具）

用服务端工具（第 5 章）时，API 在服务端跑采样循环。若它达到默认的 10 次迭代上限，会返回 `stop_reason: "pause_turn"`。把响应原样发回继续即可——**不要**额外加一条 "Continue." 用户消息：

```python
if response.stop_reason == "pause_turn":
    messages.append({"role": "assistant", "content": response.content})
    continue    # 重新请求，服务端自动续上
```

## 4.6 Tool Runner（自动循环，推荐）

手写循环你理解了原理，但日常开发可以用 SDK 的 **Tool Runner**（beta）替你跑循环——它自动调 API、执行你的工具函数、喂回结果，直到模型完成。

Python 用 `@beta_tool` 装饰器，工具就是带类型注解的函数：

```python
import anthropic
from anthropic import beta_tool

client = anthropic.Anthropic()

@beta_tool
def get_weather(location: str, unit: str = "celsius") -> str:
    """获取某地的当前天气。

    Args:
        location: 城市名，如 San Francisco, CA。
        unit: 温度单位，"celsius" 或 "fahrenheit"。
    """
    return f"{location} 当前晴，22°C"

# Tool Runner 自动处理整个 agent 循环
runner = client.beta.messages.tool_runner(
    model="claude-opus-4-8",
    max_tokens=4096,
    tools=[get_weather],
    messages=[{"role": "user", "content": "巴黎天气怎么样？"}],
)

# 每次迭代产出一个 BetaMessage；模型没有更多工具调用时自动停止
for message in runner:
    for block in message.content:
        if block.type == "text":
            print(block.text)
```

> **原理细节**：`@beta_tool` 从函数签名自动生成 schema，从 **docstring 生成工具说明**。所以 docstring 要写清楚——模型完全靠它决定何时、怎么调用。这呼应第一册第 7 章写 MCP 工具的原则。

异步版用 `@beta_async_tool` + `async def`。

TypeScript 用 `betaZodTool` + Zod schema：

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";

const client = new Anthropic();

const getWeather = betaZodTool({
  name: "get_weather",
  description: "获取某地的当前天气",
  inputSchema: z.object({
    location: z.string().describe("城市名，如 San Francisco, CA"),
  }),
  run: async ({ location }) => `${location} 当前晴，22°C`,
});

const finalMessage = await client.beta.messages.toolRunner({
  model: "claude-opus-4-8",
  max_tokens: 4096,
  tools: [getWeather],
  messages: [{ role: "user", content: "巴黎天气怎么样？" }],
});
console.log(finalMessage.content);
```

### 手写循环 vs Tool Runner，怎么选？

| 用手写循环 | 用 Tool Runner |
|---|---|
| 需要人在回路审批每个工具调用 | 标准的"调工具直到完成" |
| 自定义日志、条件执行 | 想少写样板代码 |
| 需要在工具调用间插入逻辑 | 类型安全的工具输入 |

## 4.7 工具选择（tool_choice）

控制模型何时用工具：

```python
tool_choice={"type": "auto"}                       # 模型自己决定（默认）
tool_choice={"type": "any"}                        # 必须用至少一个工具
tool_choice={"type": "tool", "name": "get_weather"} # 必须用指定工具
tool_choice={"type": "none"}                       # 禁止用工具
```

任何 `tool_choice` 都可加 `"disable_parallel_tool_use": True` 强制一次最多调一个工具（默认允许一次多个）。

## 4.8 工具表面设计（架构判断）

设计 agent 时一个核心判断：**什么时候该给一个专门的工具，什么时候用通用的 bash 工具？**

- **bash 工具**给模型最大的程序化能力——几乎能做任何事。但你的程序只收到一个不透明的命令字符串，无法对特定动作做拦截、渲染、审计。
- **专门工具**给你的程序一个针对性的钩子，带类型化参数，可以拦截、门控、渲染、审计、并行化。

什么时候把动作提升为专门工具？

- **安全边界**：需要门控的动作（外部 API 调用、发消息、删数据）。`send_email` 工具好门控，`bash -c "curl -X POST ..."` 不好门控。可逆性是个好标准——难以撤销的动作适合门控。
- **新鲜度检查**：专门的 `edit` 工具能在文件自上次读取后被改动时拒绝写入；bash 做不到。
- **渲染**：某些动作需要自定义 UI（如把"提问"做成工具，渲染成弹窗）。
- **调度**：只读工具（`glob`、`grep`）能标记为并行安全；bash 里跑的话程序无法区分并行安全的 grep 和不安全的 git push。

**经验法则**：从 bash 起步求广度；当你需要门控、渲染、审计、或并行化某个动作时，把它提升为专门工具。

## 4.9 给工具的安全提醒

Tool Runner 在模型请求时**自动执行**你的工具函数。对有副作用的工具（发邮件、改数据库、转账），在工具函数内部验证输入，对破坏性操作考虑要求确认。需要在每次执行前人工审批的，用手写循环（4.3 节）。

## 4.10 端到端实战：从零搭一个能跑的本地知识库 agent

前面的代码都是片段。这一节把它们拼成**一个完整、可复制、能跑通的项目**——一个能回答"我本地文档里有什么"的命令行 agent。它有三个工具（列文件、读文件、全文搜索），用 4.3 节的手写循环把它们串起来，跑起来你能亲眼看到 agent 循环在工作。

### 它能做什么

```
你: 我的笔记里关于"退款政策"都写了什么？
agent:（自己决定）先 search_notes("退款政策") 找到相关文件
      → 再 read_note("policy/refund.md") 读全文
      → 综合后回答你
```

模型自己决定调哪些工具、按什么顺序——你不写流程，只给工具。

### 完整代码

> 👉 **可直接运行的完整文件**：[`示例代码/知识库agent/agent.py`](示例代码/知识库agent/agent.py)（已附两个示例笔记，配好 key 即可 `python agent.py`）。下面把它逐段读一遍。

新建一个目录，放几个 `.md` 笔记，然后保存这个 `agent.py`：

```python
import os
import json
import anthropic

# ── 1. 准备：限定一个安全的笔记目录 ──────────────────
NOTES_DIR = os.path.abspath("./notes")   # agent 只能访问这个目录

client = anthropic.Anthropic()

# ── 2. 工具实现（真正干活的函数）────────────────────
def _safe_path(rel: str) -> str:
    """防目录穿越：把相对路径限制在 NOTES_DIR 内（呼应 4.8 安全边界）。"""
    full = os.path.realpath(os.path.join(NOTES_DIR, rel))
    if not full.startswith(NOTES_DIR + os.sep):
        raise ValueError(f"不允许访问 {rel}")
    return full

def list_notes() -> str:
    """列出所有笔记文件。"""
    files = []
    for root, _, names in os.walk(NOTES_DIR):
        for n in names:
            if n.endswith(".md"):
                files.append(os.path.relpath(os.path.join(root, n), NOTES_DIR))
    return json.dumps(files, ensure_ascii=False)

def read_note(path: str) -> str:
    """读取一个笔记的全文。"""
    return open(_safe_path(path), encoding="utf-8").read()

def search_notes(keyword: str) -> str:
    """在所有笔记里全文搜索关键词，返回命中的文件和所在行。"""
    hits = []
    for root, _, names in os.walk(NOTES_DIR):
        for n in names:
            if not n.endswith(".md"):
                continue
            rel = os.path.relpath(os.path.join(root, n), NOTES_DIR)
            for i, line in enumerate(open(os.path.join(root, n), encoding="utf-8"), 1):
                if keyword in line:
                    hits.append({"file": rel, "line": i, "text": line.strip()})
    return json.dumps(hits, ensure_ascii=False) if hits else "无匹配"

# 工具名 → 实现的映射，harness 用它来分发
TOOL_IMPL = {
    "list_notes": lambda args: list_notes(),
    "read_note": lambda args: read_note(args["path"]),
    "search_notes": lambda args: search_notes(args["keyword"]),
}

# ── 3. 工具定义（喂给模型的"说明书"，描述要清晰，见 4.6）──
TOOLS = [
    {
        "name": "list_notes",
        "description": "列出知识库里所有笔记文件的路径。想知道有哪些笔记时用。",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "read_note",
        "description": "读取指定笔记的全文。需要某个文件的完整内容时用。",
        "input_schema": {
            "type": "object",
            "properties": {"path": {"type": "string", "description": "笔记的相对路径，如 'policy/refund.md'"}},
            "required": ["path"],
        },
    },
    {
        "name": "search_notes",
        "description": "在所有笔记里全文搜索关键词，返回命中的文件和行。想定位某个话题在哪些笔记里时用。",
        "input_schema": {
            "type": "object",
            "properties": {"keyword": {"type": "string", "description": "搜索关键词"}},
            "required": ["keyword"],
        },
    },
]

# ── 4. Agent 循环（4.3 节的手写循环，这里是完整版）──────
def run_agent(user_question: str) -> str:
    messages = [{"role": "user", "content": user_question}]
    while True:
        response = client.messages.create(
            model="claude-opus-4-8",
            max_tokens=4096,
            system=f"你是一个本地知识库助手。只依据笔记内容回答，"
                   f"不要编造。笔记目录是 {NOTES_DIR}。",
            tools=TOOLS,
            messages=messages,
        )
        if response.stop_reason == "end_turn":
            return next(b.text for b in response.content if b.type == "text")

        # 把模型这一轮（含 tool_use 块）追加进历史
        messages.append({"role": "assistant", "content": response.content})

        # 执行每个工具调用，收集结果
        tool_results = []
        for block in response.content:
            if block.type == "tool_use":
                print(f"  [工具] {block.name}({block.input})")   # 透明：看见它在调什么
                try:
                    result = TOOL_IMPL[block.name](block.input)
                except Exception as e:
                    result = f"错误：{e}"
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result,
                })
        messages.append({"role": "user", "content": tool_results})

# ── 5. 命令行聊天入口 ──────────────────────────────
if __name__ == "__main__":
    print(f"知识库 agent（目录：{NOTES_DIR}）。输入问题，quit 退出。\n")
    while True:
        q = input("你: ")
        if q.strip().lower() == "quit":
            break
        print("agent:", run_agent(q), "\n")
```

### 跑起来

```bash
mkdir -p notes/policy
echo "# 退款政策\n我们支持七天无理由退款，需保留原包装。" > notes/policy/refund.md
echo "# 配送\n默认顺丰，偏远地区 3-5 天。" > notes/shipping.md

export ANTHROPIC_API_KEY=sk-ant-...
python agent.py
```

一次真实对话（注意 `[工具]` 那几行——那就是 agent 循环在你眼前运转）：

```
你: 退款需要什么条件？
  [工具] search_notes({'keyword': '退款'})
  [工具] read_note({'path': 'policy/refund.md'})
agent: 根据你的笔记，退款需要满足两个条件：七天内、且保留原包装。
```

### 这个项目教会你什么

对照前面各节，这个 30 分钟能跑通的项目把整章串了起来：

- **手写循环（4.3）**：`run_agent` 就是那个 `while` 循环的完整、可运行版本——模型决策、执行工具、喂回结果、直到 `end_turn`。
- **多工具协作**：模型自己决定先 `search` 再 `read`，你没写这个流程。
- **工具描述（4.6）**：每个工具的 description 写清了"什么时候用"——模型靠它选对工具。
- **安全（4.8/4.9）**：`_safe_path` 防目录穿越，体现"输入当作不可信"。
- **透明**：打印 `[工具]` 让你看见 agent 在做什么（呼应第五册的可观测性）。

**练习**：给它再加一个 `write_note(path, content)` 工具（让 agent 能记笔记），并思考——这是个有副作用的工具，你会怎么加门控？（提示：4.9 节，破坏性/写操作可以在执行前要求确认，或限制只能写某个子目录。）

---

下一章：[05 · 服务端工具](05-服务端工具.md)
