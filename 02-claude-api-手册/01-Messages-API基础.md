# 第 1 章 · Messages API 基础

本章是所有后续章节的地基：基本请求、系统提示、多轮对话、图片/PDF 输入、错误处理。代码以 Python 为主，TypeScript 等价写法在关键处给出。

---

## 1.1 最小请求

```python
import anthropic

client = anthropic.Anthropic()   # 读 ANTHROPIC_API_KEY 环境变量

response = client.messages.create(
    model="claude-opus-4-8",
    max_tokens=1024,
    messages=[
        {"role": "user", "content": "法国的首都是哪里？"}
    ],
)

# response.content 是一个内容块列表（不是字符串！）
# 块类型有 text / thinking / tool_use 等，访问 .text 前先判断 .type
for block in response.content:
    if block.type == "text":
        print(block.text)
```

三个必填参数：`model`、`max_tokens`、`messages`。

> **关于 `max_tokens`**：这是输出上限。**别给太小**——撞上限会从句子中间截断，得重试。非流式请求默认给 `~16000`（保持在 SDK 的 HTTP 超时内），流式给 `~64000`。只有分类（`~256`）、明确要短输出、或控成本时才调低。

TypeScript 等价：

```typescript
import Anthropic from "@anthropic-ai/sdk";
const client = new Anthropic();

const response = await client.messages.create({
  model: "claude-opus-4-8",
  max_tokens: 1024,
  messages: [{ role: "user", content: "法国的首都是哪里？" }],
});
for (const block of response.content) {
  if (block.type === "text") console.log(block.text);
}
```

## 1.2 响应结构

```python
response.content       # 内容块列表
response.stop_reason   # 为什么停止（见 1.7）
response.usage         # token 用量
response.model         # 实际使用的模型
response.id            # 消息 ID

response.usage.input_tokens               # 输入 token
response.usage.output_tokens              # 输出 token
response.usage.cache_read_input_tokens    # 从缓存读取的（第 6 章）
response.usage.cache_creation_input_tokens
```

`response.content` 是**列表**，因为一条回复可能包含多个块——比如先一个 `thinking` 块再一个 `text` 块，或者夹杂 `tool_use` 块。**永远不要假设 `content[0]` 就是文本**，先判断 `.type`。

## 1.3 系统提示（System Prompt）

系统提示定义模型的角色和全局行为，用顶层 `system` 参数（不放在 `messages` 里）：

```python
response = client.messages.create(
    model="claude-opus-4-8",
    max_tokens=1024,
    system="你是一位资深 Python 工程师。回答务必附带可运行的代码示例。",
    messages=[{"role": "user", "content": "怎么读取 JSON 文件？"}],
)
```

系统提示是放置稳定指令的地方——角色、风格、约束、领域知识。它也处于 prompt 缓存的高价值位置（第 6 章）。

## 1.4 多轮对话：API 是无状态的

**这是新手最容易踩的概念坑。** API 不记得上一次请求。要让模型"记住"之前说过的话，你必须每次都把**完整历史**重新发过去。

```python
messages = [
    {"role": "user", "content": "我叫 Alice。"},
    {"role": "assistant", "content": "你好 Alice，很高兴认识你！"},
    {"role": "user", "content": "我叫什么名字？"},   # 模型能答出 Alice
]

response = client.messages.create(
    model="claude-opus-4-8",
    max_tokens=1024,
    messages=messages,
)
```

实战中你会维护一个不断增长的 `messages` 列表，每轮把用户消息和模型回复都追加进去：

```python
class Conversation:
    """管理多轮对话——每次发送完整历史。"""
    def __init__(self, client, model, system=None):
        self.client = client
        self.model = model
        self.system = system
        self.messages = []

    def send(self, user_text: str) -> str:
        self.messages.append({"role": "user", "content": user_text})
        response = self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            system=self.system,
            messages=self.messages,
        )
        # 把模型回复也存进历史，下一轮要带上
        reply = next((b.text for b in response.content if b.type == "text"), "")
        self.messages.append({"role": "assistant", "content": reply})
        return reply

conv = Conversation(client, "claude-opus-4-8", system="你是一个友好的助手。")
print(conv.send("我叫 Alice。"))
print(conv.send("我叫什么名字？"))    # 它记得 Alice，因为历史被重新发送了
```

**对话规则**：

- 第一条消息必须是 `user`。
- 角色通常 `user`/`assistant` 交替，但连续同角色也允许（API 会合并成一轮）。
- 历史越长，每次请求越贵越慢——这就是为什么需要 prompt caching（第 6 章）和服务端压缩（第 7 章）。

## 1.5 图片输入（Vision）

`content` 可以是一个块列表，混合文字和图片：

```python
import base64

with open("chart.png", "rb") as f:
    image_data = base64.standard_b64encode(f.read()).decode("utf-8")

response = client.messages.create(
    model="claude-opus-4-8",
    max_tokens=1024,
    messages=[{
        "role": "user",
        "content": [
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": "image/png",
                    "data": image_data,
                },
            },
            {"type": "text", "text": "这张图表说明了什么趋势？"},
        ],
    }],
)
```

也可以直接用 URL：

```python
{
    "type": "image",
    "source": {"type": "url", "url": "https://example.com/image.png"},
}
```

支持 JPEG / PNG / GIF / WebP。贴 UI 设计稿让它实现、贴报错截图让它排查，都是高频用法。

## 1.6 PDF 与文档输入

```python
import base64

with open("report.pdf", "rb") as f:
    pdf_data = base64.standard_b64encode(f.read()).decode("utf-8")

response = client.messages.create(
    model="claude-opus-4-8",
    max_tokens=2048,
    messages=[{
        "role": "user",
        "content": [
            {
                "type": "document",
                "source": {
                    "type": "base64",
                    "media_type": "application/pdf",
                    "data": pdf_data,
                },
            },
            {"type": "text", "text": "总结这份报告的关键发现。"},
        ],
    }],
)
```

要对同一个文件问很多问题？别每次重传——用 Files API 上传一次、拿 `file_id` 反复引用（第 7 章）。

## 1.7 停止原因（stop_reason）

每次响应的 `stop_reason` 告诉你模型为什么停下，你的代码应当分支处理：

| 值 | 含义 | 你该做什么 |
|---|---|---|
| `end_turn` | 自然说完了 | 正常处理结果 |
| `max_tokens` | 撞到 `max_tokens` 上限 | 输出被截断——调大上限或改用流式 |
| `tool_use` | 想调用工具 | 执行工具，把结果喂回去（第 4 章） |
| `pause_turn` | 服务端工具循环暂停，可续 | 把响应原样发回继续（第 5 章） |
| `refusal` | 出于安全拒绝 | 检查 `stop_details`，别用同样的 prompt 重试 |

```python
if response.stop_reason == "refusal":
    # Fable 5 等模型可能因安全分类器拒绝；content 可能为空
    print("请求被拒绝：", response.stop_details)
elif response.stop_reason == "max_tokens":
    print("输出被截断，需要调大 max_tokens 或改用流式")
else:
    print(response.content[0].text)
```

## 1.8 错误处理

用 SDK 提供的**类型化异常**，不要去匹配错误消息字符串：

```python
import anthropic

try:
    response = client.messages.create(...)
except anthropic.BadRequestError as e:        # 400 请求格式错误
    print(f"请求有误: {e.message}")
except anthropic.AuthenticationError:          # 401 key 无效
    print("API key 无效")
except anthropic.PermissionDeniedError:        # 403 无权限
    print("key 缺少所需权限")
except anthropic.NotFoundError:                # 404 模型 ID 错误
    print("模型 ID 或端点无效")
except anthropic.RateLimitError as e:          # 429 限流
    retry_after = int(e.response.headers.get("retry-after", "60"))
    print(f"被限流，{retry_after}s 后重试")
except anthropic.APIStatusError as e:          # 其他 HTTP 错误
    if e.status_code >= 500:
        print(f"服务端错误 ({e.status_code})，稍后重试")
    else:
        print(f"API 错误: {e.message}")
except anthropic.APIConnectionError:           # 网络问题
    print("网络错误，检查连接")
```

> **SDK 自动重试**：429 和 5xx 错误，SDK 默认用指数退避自动重试 2 次（`max_retries` 可配）。只有需要超出默认行为时才手写重试逻辑。

完整错误码表见[附录](附录-速查与排错.md)。

## 1.9 超时与客户端配置

```python
import anthropic, httpx

# 默认请求超时 10 分钟
client = anthropic.Anthropic(timeout=20.0)               # 改成 20 秒
client = anthropic.Anthropic(max_retries=5)              # 改重试次数

# 单次请求覆盖配置，不改动客户端
client.with_options(timeout=5.0, max_retries=1).messages.create(...)
```

> **大 `max_tokens` 必须流式**：SDK 估算某个非流式请求会超过约 10 分钟时会直接抛 `ValueError`（防止连接被丢弃）。`max_tokens` 超过约 16K 就该用流式（第 3 章）。

---

下一章：[02 · 思考、Effort 与结构化输出](02-思考-Effort与结构化输出.md)
