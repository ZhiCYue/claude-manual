# 第 6 章 · Prompt Caching（提示缓存）

这是省钱省时的最重要手段——对重复使用的大段上下文，缓存能省最多 90% 的成本。但它有一条必须理解的铁律，违反了再多 `cache_control` 标记也没用。

---

## 6.1 唯一的铁律

> **Prompt caching 是前缀匹配。前缀里任何一个字节的变化，都会让其后的一切缓存失效。**

缓存键由"渲染后的 prompt 直到每个 `cache_control` 断点处的精确字节"决定。位置 N 处的一个字节不同——一个时间戳、一个重排的 JSON 键、一个不同的工具——就会让 ≥N 的所有断点缓存失效。

渲染顺序是：`tools` → `system` → `messages`。在最后一个 system 块上放断点，会把 tools 和 system 一起缓存。

**把构建 prompt 的代码围绕这条铁律设计**：稳定内容在前，易变内容在后。

## 6.2 自动缓存（最简单）

不需要精细控制时，用顶层 `cache_control` 自动缓存请求里最后一个可缓存块：

```python
response = client.messages.create(
    model="claude-opus-4-8",
    max_tokens=4096,
    cache_control={"type": "ephemeral"},   # 自动缓存最后一个可缓存块
    system="你是这份大文档的专家……（很长的上下文）",
    messages=[{"role": "user", "content": "总结要点"}],
)
```

## 6.3 手动缓存控制

精细控制时，在特定内容块上加 `cache_control`：

```python
response = client.messages.create(
    model="claude-opus-4-8",
    max_tokens=4096,
    system=[{
        "type": "text",
        "text": "你是这份大文档的专家……",
        "cache_control": {"type": "ephemeral"},   # 默认 5 分钟 TTL
    }],
    messages=[{"role": "user", "content": "总结要点"}],
)

# 1 小时 TTL
system=[{
    "type": "text",
    "text": "……",
    "cache_control": {"type": "ephemeral", "ttl": "1h"},
}]
```

## 6.4 验证缓存命中

```python
print(response.usage.cache_creation_input_tokens)  # 写入缓存的 token（约 1.25x 成本）
print(response.usage.cache_read_input_tokens)      # 从缓存读取的（约 0.1x 成本）
print(response.usage.input_tokens)                 # 全价处理的（未缓存）
```

> **如果 `cache_read_input_tokens` 在重复的相同前缀请求里总是 0**，说明有"静默失效器"在作怪——见 6.6 节。

## 6.5 断点放置模式

### 大系统提示，跨多请求共享

在最后一个 system 文本块放断点。有工具的话，工具渲染在 system 前面——标记在最后一个 system 块上会把 tools + system 一起缓存。

### 多轮对话

在最近追加的那一轮的最后一个内容块放断点。每次后续请求复用整个之前的对话前缀。命中随对话增长而累积：

```python
messages[-1]["content"][-1]["cache_control"] = {"type": "ephemeral"}
```

### 共享前缀，变化后缀

很多请求共享一大段固定前言（few-shot 例子、检索文档、指令），只有最后的问题不同。断点放在**共享部分**的末尾，不是整个 prompt 的末尾——否则每个请求都写一个不同的缓存条目，永远读不到。

```python
"messages": [{"role": "user", "content": [
    {"type": "text", "text": "（共享的大段上下文）", "cache_control": {"type": "ephemeral"}},
    {"type": "text", "text": "（每次都变的问题）"},   # 不加标记
]}]
```

## 6.6 静默失效器（审计清单）

审查代码时，在喂给 prompt 前缀的任何东西里 grep 这些模式：

| 模式 | 为什么破坏缓存 |
|---|---|
| 系统提示里的 `datetime.now()` / `Date.now()` | 每次请求前缀都变 |
| 内容前部的 `uuid4()` / 请求 ID | 同上，每个请求都唯一 |
| `json.dumps(d)` 没加 `sort_keys=True` | 序列化不确定 → 字节不同 |
| 系统提示里插值 session/user ID | 每用户一个前缀，无法跨用户共享 |
| 条件性 system 段落（`if flag: system += ...`） | 每种 flag 组合都是不同前缀 |
| `tools=build_tools(user)` 每用户工具集不同 | 工具在位置 0，跨用户什么都不缓存 |

修法：把动态部分移到最后一个断点之后，或让它确定化，或如果不是必需就删掉。

## 6.7 架构指导（比标记放置更重要）

**先解决这些**：

1. **保持系统提示冻结**。别往系统提示里插"当前日期 X""模式 Y""用户名 Z"——它们在前缀最前面，会让下游全部失效。把动态上下文注入到 `messages` 里靠后的位置。
2. **别在对话中途换工具或换模型**。工具渲染在位置 0；增删或重排一个工具会让整个缓存失效。换模型也一样（缓存按模型隔离）。需要"模式"时，别换工具集——给 Claude 一个记录模式转换的工具，或把模式作为消息内容传。确定性地序列化工具（按名字排序）。
3. **Fork 操作必须复用父级的精确前缀**。摘要、压缩、子代理等副计算常另起一个 API 调用。如果 fork 重建的 `system`/`tools`/`model` 有任何不同，就完全错过父级缓存。复制父级的这三项，再在末尾追加 fork 专属内容。

## 6.8 经济学

- 缓存**读取**成本约为基础输入价的 0.1x。
- 缓存**写入**：5 分钟 TTL 是 1.25x，1 小时 TTL 是 2x。
- **盈亏平衡**：5 分钟 TTL 下两次请求即回本（1.25x + 0.1x = 1.35x，对比 2 次未缓存的 2x）；1 小时 TTL 需至少三次请求回本。
- 最多 **4 个** `cache_control` 断点/请求。
- **最小可缓存前缀有门槛**（按模型不同，约 1024–4096 token）。低于门槛的前缀静默不缓存——无报错，只是 `cache_creation_input_tokens: 0`。Opus 4.8 是 4096 token，Fable 5 和 Sonnet 4.6 是 2048。

## 6.9 Agent 场景的缓存技巧

| 约束 | Agent 专属对策 |
|---|---|
| 中途改系统提示会失效缓存 | 改用追加 `{"role": "system", ...}` 消息到 `messages[]`（beta，支持的模型上），保留缓存前缀 |
| 中途换模型会失效缓存 | 用便宜模型跑子代理处理子任务，主循环保持一个模型 |
| 增删工具会失效缓存 | 用 tool search 动态发现——它追加工具 schema 而非替换，保留前缀 |

## 6.10 预热缓存

要消除第一个真实请求的缓存未命中延迟，启动时发一个 `max_tokens: 0` 的请求——API 跑 prefill 写入缓存，立即返回（`content: []`，零输出 token 计费，正常的缓存写入计费）。

```python
client.messages.create(
    model="claude-opus-4-8",
    max_tokens=0,
    system=[{"type": "text", "text": SYSTEM_PROMPT, "cache_control": {"type": "ephemeral"}}],
    messages=[{"role": "user", "content": "warmup"}],
)
```

**何时预热**：首次请求延迟用户可见（聊天/语音/交互）、共享前缀够大、且有流量到来前的时机（启动、部署后、计划窗口开始）。流量连续（请求间隔 ≤ TTL）时不要预热——真实请求会自己保温。

---

下一章：[07 · 规模化：Batches、Files 与长对话](07-规模化-Batches-Files与长对话.md)
