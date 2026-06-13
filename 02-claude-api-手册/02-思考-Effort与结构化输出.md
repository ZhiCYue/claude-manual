# 第 2 章 · 思考、Effort 与结构化输出

这一章讲三件能显著提升输出质量和可用性的事：让模型"先想后答"、控制它想多深、强制它输出合法 JSON。

---

## 2.1 Adaptive Thinking（自适应思考）

让模型在回答前进行内部推理。在 Claude 4.6+ 的模型上，**推荐用 adaptive 模式**——模型自己动态决定何时思考、思考多少，你不用调 token 预算。

```python
response = client.messages.create(
    model="claude-opus-4-8",
    max_tokens=16000,
    thinking={"type": "adaptive", "display": "summarized"},
    output_config={"effort": "high"},   # low | medium | high | max
    messages=[{"role": "user", "content": "一步步解这道题：……"}],
)

for block in response.content:
    if block.type == "thinking":
        print(f"[思考] {block.thinking}")
    elif block.type == "text":
        print(f"[回答] {block.text}")
```

### `display` 参数——是否返回思考内容

| 值 | 行为 |
|---|---|
| `"summarized"` | 返回推理过程的可读摘要 |
| `"omitted"`（默认） | 思考照常发生并照常计费，但 `thinking` 块的文本为空 |

> **重要的默认值变化**：在 Fable 5 / Opus 4.8 / Opus 4.7 上，`display` 默认是 `"omitted"`。如果你要把推理过程展示给用户，**必须显式设 `display: "summarized"`**，否则用户会看到一段长时间的"卡顿"（模型在思考但不返回文本）。

> **原始思维链永不暴露**：无论哪个设置，模型的原始 chain-of-thought 都不会返回给你。`display` 只控制是否返回摘要。

### 多轮对话中回传思考块

继续同一个对话时，把收到的 `thinking` 块**原样**传回去（这是标准的多轮模式；删改它们会破坏这一轮）。不同模型之间，思考块会被静默丢弃，无需手动处理。

### 关于 `budget_tokens`（已废弃）

旧的"固定 token 预算思考"（`thinking: {type: "enabled", budget_tokens: N}`）在 Fable 5 / Opus 4.8 / 4.7 上会 **400**，在 Opus 4.6 / Sonnet 4.6 上已废弃。新代码一律用 adaptive thinking + effort 参数。如果有人要"思考预算"，正确答案是用 `effort`，不是 token 数。

## 2.2 Effort 参数——控制思考深度与花费

`output_config.effort` 控制模型思考多深、总共花多少 token。注意它**嵌在 `output_config` 里**，不是顶层参数。

```python
output_config={"effort": "high"}    # low | medium | high | xhigh | max
```

| 级别 | 何时用 | 效果 |
|---|---|---|
| `low` | 子代理、简单任务、对延迟敏感 | 工具调用更少更集中，前言更短，确认更简洁 |
| `medium` | 大多数应用的平衡点 | 质量和成本的甜点 |
| `high`（默认） | 对智能敏感的工作 | 推荐的最低档 |
| `xhigh` | 编码和 agent 任务的最佳设置（Fable 5 / Opus 4.7/4.8） | 介于 high 和 max 之间 |
| `max` | 正确性比成本更重要时 | 最深推理，可能过度思考 |

支持的模型：Fable 5、Opus 4.5/4.6/4.7/4.8、Sonnet 4.6。在 Sonnet 4.5 / Haiku 4.5 上会报错。

> **经验法则**：`high` 通常是质量和 token 效率的平衡点；编码和 agent 任务上 `xhigh`；正确性压倒成本时用 `max`；子代理和简单任务用 `low`。effort 越高，工具调用越少越合并、前言越少。在 Opus 4.8 上，effort 比以往任何 Opus 都更重要——迁移时要重新调。

## 2.3 结构化输出（JSON）

让模型保证输出合法的、符合你 schema 的 JSON。这对"提取信息存数据库""调用下游 API"这类需要可解析输出的场景至关重要。

### 用 Pydantic（Python 推荐）

`client.messages.parse()` 会自动用你的 schema 验证响应：

```python
from pydantic import BaseModel
from typing import List
import anthropic

class ContactInfo(BaseModel):
    name: str
    email: str
    plan: str
    interests: List[str]
    demo_requested: bool

client = anthropic.Anthropic()

response = client.messages.parse(
    model="claude-opus-4-8",
    max_tokens=1024,
    messages=[{
        "role": "user",
        "content": "提取：Jane Doe (jane@co.com) 想要企业版，对 API 和 SDK 感兴趣，想要演示。",
    }],
    output_format=ContactInfo,
)

contact = response.parsed_output    # 一个验证过的 ContactInfo 实例
print(contact.name)        # "Jane Doe"
print(contact.interests)   # ["API", "SDKs"]
print(contact.demo_requested)   # True
```

### 用 Zod（TypeScript 推荐）

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

const ContactSchema = z.object({
  name: z.string(),
  email: z.string(),
  plan: z.string(),
  demo_requested: z.boolean(),
});

const response = await client.messages.parse({
  model: "claude-opus-4-8",
  max_tokens: 1024,
  messages: [{ role: "user", content: "提取：……" }],
  output_config: { format: zodOutputFormat(ContactSchema) },
});

console.log(response.parsed_output!.name);
```

### 原始 JSON Schema

不用 Pydantic/Zod 时直接写 schema：

```python
response = client.messages.create(
    model="claude-opus-4-8",
    max_tokens=1024,
    messages=[{"role": "user", "content": "提取：John Smith (john@example.com) 想要企业版。"}],
    output_config={
        "format": {
            "type": "json_schema",
            "schema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string"},
                    "email": {"type": "string"},
                    "plan": {"type": "string"},
                },
                "required": ["name", "email", "plan"],
                "additionalProperties": False,    # 结构化输出要求所有对象都设这个
            },
        }
    },
)

import json
text = next(b.text for b in response.content if b.type == "text")
data = json.loads(text)
```

### Schema 的限制

**支持**：基本类型、`enum`、`const`、`anyOf`、`allOf`、`$ref`/`$def`、字符串格式（`date-time`、`email`、`uri`、`uuid` 等）、`additionalProperties: false`（所有对象必须设）。

**不支持**：递归 schema、数值约束（`minimum`/`maximum`）、字符串长度约束（`minLength`/`maxLength`）、复杂数组约束。Python/TS SDK 会自动剥离不支持的约束并在客户端验证。

### 注意事项

- **首次请求有延迟**：新 schema 有一次性编译成本，之后 24 小时内缓存。
- **拒绝时不保证符合**：若 `stop_reason: "refusal"`，输出可能不符合 schema。
- **被截断时可能不完整**：若 `stop_reason: "max_tokens"`，JSON 可能没写完——调大 `max_tokens`。
- **不兼容**：引用（citations）、消息预填充。**兼容**：批处理、流式、token 计数、扩展思考。

## 2.4 严格工具调用（strict tool use）

结构化输出的另一面：保证工具参数符合 schema。在工具定义里加 `strict: True`：

```python
tools=[{
    "name": "book_flight",
    "description": "预订航班",
    "strict": True,
    "input_schema": {
        "type": "object",
        "properties": {
            "destination": {"type": "string"},
            "date": {"type": "string", "format": "date"},
            "passengers": {"type": "integer", "enum": [1, 2, 3, 4, 5, 6, 7, 8]},
        },
        "required": ["destination", "date", "passengers"],
        "additionalProperties": False,
    },
}]
```

工具的细节在第 4 章。

---

下一章：[03 · Streaming 流式输出](03-Streaming流式输出.md)
