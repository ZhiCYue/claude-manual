"""评估跑分器 —— 第五册第 7.9 节的评估脚手架之三(完整可运行)。

对数据集里每条查询:跑被测系统 → LLM 裁判对照 rubric 打分 → 汇总通过率
和失败 case。你的 agent/prompt 改动后跑一遍,就知道是变好还是变坏。

用法:
    export ANTHROPIC_API_KEY=sk-ant-...
    python run_eval.py

依赖:pip install anthropic
"""

import json
import anthropic
from eval_dataset import DATASET
from rubric import RUBRIC

client = anthropic.Anthropic()


def run_agent(query: str) -> str:
    """被测系统:换成你真实的 agent/prompt。这里用占位实现。"""
    resp = client.messages.create(
        model="claude-opus-4-8", max_tokens=1024,
        system="你是客服助手,只依据知识库回答,没有就如实说。",
        messages=[{"role": "user", "content": query}],
    )
    return next(b.text for b in resp.content if b.type == "text")


def judge(query: str, answer: str, expect: str) -> dict:
    """LLM 裁判:对照 rubric 打分,返回结构化结果(7.3 节)。"""
    resp = client.messages.create(
        model="claude-opus-4-8", max_tokens=1024,
        messages=[{"role": "user", "content": f"""{RUBRIC}

查询:{query}
该回答期望命中:{expect}
被评估的回答:{answer}

以 JSON 输出:{{"scores": {{"准确性": n, "完整性": n, "拒答": n, "简洁": n}}, "pass": true/false, "reason": "..."}}"""}],
        output_config={"format": {"type": "json_schema", "schema": {
            "type": "object",
            "properties": {
                "scores": {"type": "object", "additionalProperties": {"type": "integer"}},
                "pass": {"type": "boolean"}, "reason": {"type": "string"},
            },
            "required": ["scores", "pass", "reason"], "additionalProperties": False,
        }}},
    )
    return json.loads(next(b.text for b in resp.content if b.type == "text"))


def main():
    passed = 0
    fails = []
    for case in DATASET:
        answer = run_agent(case["query"])
        verdict = judge(case["query"], answer, case["expect"])
        mark = "✅" if verdict["pass"] else "❌"
        print(f"{mark} [{case['id']}] {case['query'][:20]}…")
        if verdict["pass"]:
            passed += 1
        else:
            fails.append((case["id"], verdict["reason"]))

    print(f"\n通过率:{passed}/{len(DATASET)} = {passed/len(DATASET)*100:.0f}%")
    if fails:
        print("\n失败的 case(拿去针对性改进):")
        for cid, reason in fails:
            print(f"  [{cid}] {reason}")


if __name__ == "__main__":
    main()
