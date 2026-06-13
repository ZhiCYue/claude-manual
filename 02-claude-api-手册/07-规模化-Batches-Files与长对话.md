# 第 7 章 · 规模化：Batches、Files 与长对话

当你从"几个请求"走向"几万个请求"或"跑几小时的长对话"，需要三样工具：批处理（省一半钱）、文件 API（避免重传）、服务端压缩（突破上下文窗口）。

---

## 7.1 Batches API（批处理，半价）

对不要求实时的任务，批处理以**标准价格的 50%** 异步处理。

**关键事实**：每批最多 10 万请求 / 256 MB；多数 1 小时内完成（最长 24 小时）；结果保留 29 天；所有 Messages API 功能都支持（vision、工具、缓存）。

### 创建批次

```python
import anthropic
from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
from anthropic.types.messages.batch_create_params import Request

client = anthropic.Anthropic()

batch = client.messages.batches.create(
    requests=[
        Request(
            custom_id="request-1",
            params=MessageCreateParamsNonStreaming(
                model="claude-opus-4-8",
                max_tokens=1024,
                messages=[{"role": "user", "content": "总结气候变化的影响"}],
            ),
        ),
        Request(
            custom_id="request-2",
            params=MessageCreateParamsNonStreaming(
                model="claude-opus-4-8",
                max_tokens=1024,
                messages=[{"role": "user", "content": "解释量子计算基础"}],
            ),
        ),
    ]
)
print(f"批次 ID: {batch.id}, 状态: {batch.processing_status}")
```

### 轮询完成

```python
import time

while True:
    batch = client.messages.batches.retrieve(batch.id)
    if batch.processing_status == "ended":
        break
    print(f"处理中: {batch.request_counts.processing}")
    time.sleep(60)

print(f"成功: {batch.request_counts.succeeded}, 失败: {batch.request_counts.errored}")
```

### 取结果

用 `custom_id` 对应回你的请求（结果顺序不保证）：

```python
for result in client.messages.batches.results(batch.id):
    if result.result.type == "succeeded":
        msg = result.result.message
        text = next((b.text for b in msg.content if b.type == "text"), "")
        print(f"[{result.custom_id}] {text[:100]}")
    elif result.result.type == "errored":
        if result.result.error.type == "invalid_request":
            print(f"[{result.custom_id}] 校验错误——修正后重试")
        else:
            print(f"[{result.custom_id}] 服务端错误——可安全重试")
    elif result.result.type == "expired":
        print(f"[{result.custom_id}] 已过期——重新提交")
```

### 实战：批量情感分类

```python
items = ["产品质量很棒！", "客服太差，再也不来了。", "还行，没什么特别。"]

requests = [
    Request(
        custom_id=f"classify-{i}",
        params=MessageCreateParamsNonStreaming(
            model="claude-haiku-4-5",       # 简单任务用 haiku 更省
            max_tokens=50,
            messages=[{"role": "user", "content": f"分类为 正面/负面/中性（一个词）：{text}"}],
        ),
    )
    for i, text in enumerate(items)
]

batch = client.messages.batches.create(requests=requests)
# ……轮询 + 取结果
```

批处理可配合 prompt caching：把共享的大文档放在每个请求的 `system` 里加 `cache_control`。

## 7.2 Files API（文件复用）

上传一次文件，跨多个请求用 `file_id` 引用，避免重传。

**关键事实**：单文件最大 500 MB；每组织总存储 100 GB；文件持久保存直到删除；上传/列出/删除免费，用在消息里的内容按输入 token 计费。

```python
import anthropic
client = anthropic.Anthropic()

# 上传一次
uploaded = client.beta.files.upload(
    file=("contract.pdf", open("contract.pdf", "rb"), "application/pdf"),
)
print(f"文件 ID: {uploaded.id}")

# 对同一文件问多个问题，都用 file_id 引用
questions = ["关键条款是什么？", "终止条款是什么？", "付款时间表？"]
for q in questions:
    response = client.beta.messages.create(
        model="claude-opus-4-8",
        max_tokens=1024,
        messages=[{
            "role": "user",
            "content": [
                {"type": "text", "text": q},
                {"type": "document", "source": {"type": "file", "file_id": uploaded.id}},
            ],
        }],
        betas=["files-api-2025-04-14"],
    )
    text = next((b.text for b in response.content if b.type == "text"), "")
    print(f"Q: {q}\nA: {text[:200]}\n")

# 用完清理
client.beta.files.delete(uploaded.id)
```

文件管理：`client.beta.files.list()`、`.retrieve_metadata(id)`、`.delete(id)`、`.download(id)`（只有代码执行工具或 skills 创建的文件能下载，用户上传的不能）。

## 7.3 长对话：服务端压缩（Compaction）

当对话接近上下文窗口上限，**压缩**会在服务端自动把早期上下文总结成摘要。Beta，支持 Fable 5 / Opus 4.6/4.7/4.8 / Sonnet 4.6，需 beta 头 `compact-2026-01-12`。

```python
import anthropic
client = anthropic.Anthropic()
messages = []

def chat(user_message: str) -> str:
    messages.append({"role": "user", "content": user_message})

    response = client.beta.messages.create(
        betas=["compact-2026-01-12"],
        model="claude-opus-4-8",
        max_tokens=4096,
        messages=messages,
        context_management={"edits": [{"type": "compact_20260112"}]},
    )

    # 关键：追加完整 content，不是只追加文本！
    # 压缩块必须保留——API 用它在下次请求替换被压缩的历史
    messages.append({"role": "assistant", "content": response.content})

    return next(b.text for b in response.content if b.type == "text")

print(chat("帮我构建一个 Python 爬虫"))
print(chat("加上对 JS 渲染页面的支持"))
print(chat("再加上限速和错误处理"))
```

> ⚠️ **最容易踩的坑**：每轮要追加 `response.content`（完整内容块），**不是只追加文本字符串**。压缩块必须被保留——API 靠它在下次请求替换被压缩的历史。只提取文本追加会静默丢失压缩状态。

## 7.4 上下文管理的三种手段对比

长程 agent 累积大量历史，三种应对手段：

| 手段 | 何时用 | 效果 |
|---|---|---|
| **Context editing（上下文编辑）** | 旧工具结果、已完成的思考变陈旧 | 按阈值清除——剪枝而非总结，保持转录精简 |
| **Compaction（压缩）** | 对话可能到达或超过窗口上限 | 把早期上下文总结成压缩块（服务端） |
| **Memory（记忆）** | 状态需跨会话持久 | Claude 读写记忆目录文件，进程重启也存活 |

选择：context editing 和 compaction 在会话内（编辑剪枝陈旧轮次，压缩在接近上限时总结）；memory 用于跨会话持久。很多长程 agent 三个都用。

## 7.5 数 token（再次强调）

规划成本和窗口预算时，用 `count_tokens` 接口，**绝不用 tiktoken**：

```python
count = client.messages.count_tokens(
    model="claude-opus-4-8",
    messages=messages,
    system=system,
)
print(count.input_tokens)

# 估算输入成本
est_cost = count.input_tokens * 5 / 1_000_000   # opus-4-8 输入 $5/百万
print(f"预估输入成本: ${est_cost:.4f}")
```

token 计数是**模型相关**的——传你将用于推理的同一个模型 ID。

---

下一章：[08 · Agent SDK](08-Agent-SDK.md)
