"""汇率换算 MCP 服务器 —— 第三册第 2.9 节的端到端示例。

一个真实(但用内置汇率表,无需 API key)的 MCP 工具,用来走一遍
"写 → Inspector 测 → 接入 Claude Code → 验证"的完整开发流程。

开发流程:
    1. 用 Inspector 测(不连宿主,最快):
       uv run mcp dev currency.py
    2. 接入 Claude Code:
       claude mcp add currency -- python /绝对路径/currency.py
    3. 在会话里问:"5000 日元大概是多少人民币?"

依赖:pip install "mcp[cli]"

练习:把 _RATES 换成真实汇率 API(用 httpx 异步调,工具改 async def,见 2.5)。
     思考:如果 API 需要 key,该放哪?(提示:第 7 章——从环境变量读,
     绝不写进 docstring 或返回值。)
"""

from mcp.server.fastmcp import FastMCP

mcp = FastMCP("currency")

# 简化:内置汇率表(真实场景换成调汇率 API)
_RATES = {"USD": 1.0, "CNY": 7.2, "EUR": 0.92, "JPY": 150.0}


@mcp.tool()
def convert(amount: float, from_currency: str, to_currency: str) -> str:
    """把一笔金额从一种货币换算成另一种。

    当用户需要货币兑换、汇率换算时调用。支持 USD/CNY/EUR/JPY。

    Args:
        amount: 金额,如 100。
        from_currency: 源货币代码,如 "USD"。
        to_currency: 目标货币代码,如 "CNY"。
    """
    f, t = from_currency.upper(), to_currency.upper()
    if f not in _RATES or t not in _RATES:
        raise ValueError(f"不支持的货币,仅支持 {list(_RATES)}")
    result = amount / _RATES[f] * _RATES[t]
    return f"{amount} {f} = {result:.2f} {t}"


if __name__ == "__main__":
    mcp.run()
