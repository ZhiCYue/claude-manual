# 第 3 章 · Streaming 流式输出

流式输出让你边生成边接收 token，而不是等整个回复完成。两个理由让它几乎是默认选择：用户体验（聊天界面逐字显示）和**避免超时**（长输出的非流式请求会撞 SDK 的 HTTP 超时）。

---

## 3.1 最简流式

```python
with client.messages.stream(
    model="claude-opus-4-8",
    max_tokens=64000,
    messages=[{"role": "user", "content": "写一个短故事"}],
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)    # flush=True 让 token 立即显示
```

`messages.stream()` 是推荐的辅助方法——它替你累积状态，暴露 `text_stream`（只要文本增量）和 `get_final_message()`（拿完整消息）。

异步版本：

```python
async with async_client.messages.stream(
    model="claude-opus-4-8",
    max_tokens=64000,
    messages=[{"role": "user", "content": "写一个短故事"}],
) as stream:
    async for text in stream.text_stream:
        print(text, end="", flush=True)
```

TypeScript：

```typescript
const stream = client.messages.stream({
  model: "claude-opus-4-8",
  max_tokens: 64000,
  messages: [{ role: "user", content: "写一个短故事" }],
});
for await (const event of stream) {
  if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
    process.stdout.write(event.delta.text);
  }
}
```

## 3.2 拿完整消息

流式结束后，常常还需要完整的消息对象（看 `stop_reason`、`usage`、工具调用块）：

```python
with client.messages.stream(
    model="claude-opus-4-8",
    max_tokens=64000,
    messages=[{"role": "user", "content": "你好"}],
) as stream:
    for text in stream.text_stream:
        print(text, end="", flush=True)

    final = stream.get_final_message()
    print(f"\n\n用了 {final.usage.output_tokens} 个输出 token")
    print(f"停止原因: {final.stop_reason}")
```

> **最佳实践**：即使你需要的只是完整文本，也建议用流式 + `get_final_message()`（TS：`finalMessage()`）——这样你白拿了超时保护，又不用处理单个事件。

## 3.3 处理不同内容类型（思考 + 文本）

开了思考的流式，需要区分思考增量和文本增量：

```python
with client.messages.stream(
    model="claude-opus-4-8",
    max_tokens=64000,
    thinking={"type": "adaptive", "display": "summarized"},
    messages=[{"role": "user", "content": "分析这个问题"}],
) as stream:
    for event in stream:
        if event.type == "content_block_start":
            if event.content_block.type == "thinking":
                print("\n[思考中...]")
            elif event.content_block.type == "text":
                print("\n[回答:]")
        elif event.type == "content_block_delta":
            if event.delta.type == "thinking_delta":
                print(event.delta.thinking, end="", flush=True)
            elif event.delta.type == "text_delta":
                print(event.delta.text, end="", flush=True)
```

## 3.4 流式事件类型

底层流是一串事件，理解它们有助于处理复杂场景：

| 事件类型 | 描述 | 何时触发 |
|---|---|---|
| `message_start` | 消息元数据 | 开头一次 |
| `content_block_start` | 新内容块开始 | text/tool_use 块开始时 |
| `content_block_delta` | 增量内容 | 每个 token/块 |
| `content_block_stop` | 内容块完成 | 块结束时 |
| `message_delta` | 消息级更新 | 含 `stop_reason`、`usage` |
| `message_stop` | 消息完成 | 结尾一次 |

## 3.5 带进度统计的流式

```python
def stream_with_progress(client, **kwargs):
    total_tokens = 0
    parts = []
    with client.messages.stream(**kwargs) as stream:
        for event in stream:
            if event.type == "content_block_delta" and event.delta.type == "text_delta":
                parts.append(event.delta.text)
                print(event.delta.text, end="", flush=True)
            elif event.type == "message_delta":
                if event.usage and event.usage.output_tokens is not None:
                    total_tokens = event.usage.output_tokens
        stream.get_final_message()
    print(f"\n\n[共 {total_tokens} token]")
    return "".join(parts)
```

## 3.6 流式中的错误处理

```python
try:
    with client.messages.stream(
        model="claude-opus-4-8",
        max_tokens=64000,
        messages=[{"role": "user", "content": "写一个故事"}],
    ) as stream:
        for text in stream.text_stream:
            print(text, end="", flush=True)
except anthropic.APIConnectionError:
    print("\n连接中断，请重试。")
except anthropic.RateLimitError:
    print("\n被限流，请稍候重试。")
except anthropic.APIStatusError as e:
    print(f"\nAPI 错误: {e.status_code}")
```

## 3.7 底层：`stream=True`

`messages.stream()` 帮你累积状态。如果你只要原始事件迭代器、想要更低内存占用，给 `messages.create()` 传 `stream=True`：

```python
for event in client.messages.create(
    model="claude-opus-4-8",
    max_tokens=64000,
    messages=[{"role": "user", "content": "写一个故事"}],
    stream=True,
):
    print(event.type)
```

这种形式不替你累积最终消息——一切自己处理。大多数情况用 `messages.stream()` 即可。

## 3.8 实战：命令行流式聊天工具

把第 1 章的多轮对话和本章的流式结合起来，得到一个可用的聊天程序：

```python
import anthropic

client = anthropic.Anthropic()
messages = []

print("聊天开始（输入 quit 退出）\n")
while True:
    user_input = input("你: ")
    if user_input.strip().lower() == "quit":
        break

    messages.append({"role": "user", "content": user_input})

    print("Claude: ", end="", flush=True)
    with client.messages.stream(
        model="claude-opus-4-8",
        max_tokens=4096,
        messages=messages,
    ) as stream:
        for text in stream.text_stream:
            print(text, end="", flush=True)
        reply = stream.get_final_message()

    # 把回复存进历史，下一轮带上
    reply_text = next((b.text for b in reply.content if b.type == "text"), "")
    messages.append({"role": "assistant", "content": reply_text})
    print("\n")
```

这就是一个完整的、有记忆的、流式的聊天工具。第 4 章会给它加上"动手"的能力。

## 3.9 最佳实践小结

1. **总是 flush 输出**——`flush=True` 让 token 立即显示。
2. **追踪 token 用量**——`message_delta` 事件含 usage。
3. **默认用流式**——配合 `get_final_message()` 拿完整响应，白得超时保护。
4. **大 `max_tokens` 必须流式**——SDK 对它估算会超过约 10 分钟的非流式请求会抛 `ValueError`。Fable 5 / Opus 4.6/4.7/4.8 支持 128K 输出，但这么大必须流式。
5. **Web UI 适当缓冲**——攒几个 token 再渲染，避免过于频繁的 DOM 更新。

---

下一章：[04 · Tool Use：构建 Agent](04-Tool-Use构建Agent.md)
