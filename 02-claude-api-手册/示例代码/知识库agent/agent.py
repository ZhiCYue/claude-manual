"""本地知识库 agent —— 第二册第 4.10 节的完整可运行示例。

一个命令行 agent,有三个工具(列文件/读文件/全文搜索),用手写的 agent
循环把它们串起来。模型自己决定调哪些工具、按什么顺序。

用法:
    1. 在本目录建一些 .md 笔记,放进 ./notes/
    2. export ANTHROPIC_API_KEY=sk-ant-...
    3. python agent.py
    4. 提问,quit 退出

依赖:pip install anthropic
"""

import os
import json
import anthropic

# ── 1. 准备:限定一个安全的笔记目录 ──────────────────
NOTES_DIR = os.path.abspath("./notes")   # agent 只能访问这个目录

client = anthropic.Anthropic()


# ── 2. 工具实现(真正干活的函数)────────────────────
def _safe_path(rel: str) -> str:
    """防目录穿越:把相对路径限制在 NOTES_DIR 内(呼应 4.8 安全边界)。"""
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
    """在所有笔记里全文搜索关键词,返回命中的文件和所在行。"""
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


# 工具名 → 实现的映射,harness 用它来分发
TOOL_IMPL = {
    "list_notes": lambda args: list_notes(),
    "read_note": lambda args: read_note(args["path"]),
    "search_notes": lambda args: search_notes(args["keyword"]),
}

# ── 3. 工具定义(喂给模型的"说明书",描述要清晰,见 4.6)──
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
            "properties": {
                "path": {"type": "string", "description": "笔记的相对路径,如 'policy/refund.md'"}
            },
            "required": ["path"],
        },
    },
    {
        "name": "search_notes",
        "description": "在所有笔记里全文搜索关键词,返回命中的文件和行。想定位某个话题在哪些笔记里时用。",
        "input_schema": {
            "type": "object",
            "properties": {"keyword": {"type": "string", "description": "搜索关键词"}},
            "required": ["keyword"],
        },
    },
]


# ── 4. Agent 循环(4.3 节的手写循环,这里是完整版)──────
def run_agent(user_question: str) -> str:
    messages = [{"role": "user", "content": user_question}]
    while True:
        response = client.messages.create(
            model="claude-opus-4-8",
            max_tokens=4096,
            system=f"你是一个本地知识库助手。只依据笔记内容回答,"
                   f"不要编造。笔记目录是 {NOTES_DIR}。",
            tools=TOOLS,
            messages=messages,
        )
        if response.stop_reason == "end_turn":
            return next(b.text for b in response.content if b.type == "text")

        # 把模型这一轮(含 tool_use 块)追加进历史
        messages.append({"role": "assistant", "content": response.content})

        # 执行每个工具调用,收集结果
        tool_results = []
        for block in response.content:
            if block.type == "tool_use":
                print(f"  [工具] {block.name}({block.input})")   # 透明:看见它在调什么
                try:
                    result = TOOL_IMPL[block.name](block.input)
                except Exception as e:
                    result = f"错误:{e}"
                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result,
                })
        messages.append({"role": "user", "content": tool_results})


# ── 5. 命令行聊天入口 ──────────────────────────────
if __name__ == "__main__":
    print(f"知识库 agent(目录:{NOTES_DIR})。输入问题,quit 退出。\n")
    while True:
        q = input("你: ")
        if q.strip().lower() == "quit":
            break
        print("agent:", run_agent(q), "\n")
