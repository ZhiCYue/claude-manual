# 第 6 章 · Hooks 详解

## 6.1 核心思想：从"提示性"到"确定性"

在 CLAUDE.md 写「改完文件要跑 formatter」，模型 95% 会照做——但 95% 不是 100%。Hook 把这类要求变成**程序级保证**：在指定事件点由 harness 自动执行你的 shell 命令，**必然触发，与模型意愿无关**。

判断用哪个的口诀：**"最好做到"写 CLAUDE.md，"必须做到"写 Hook。**

## 6.2 事件点全表

| 事件 | 触发时机 | 典型用途 |
|---|---|---|
| `PreToolUse` | 工具执行**前** | 拦截危险操作、校验参数 |
| `PostToolUse` | 工具成功执行**后** | 自动格式化、自动 lint、记录日志 |
| `UserPromptSubmit` | 你提交输入时 | 注入动态上下文、敏感词检查 |
| `Stop` | Claude 完成回合时 | 完工通知、强制收尾检查 |
| `SubagentStop` | 子代理完成时 | 同上，针对子代理 |
| `SessionStart` | 会话启动/恢复时 | 加载环境信息进上下文 |
| `SessionEnd` | 会话结束时 | 清理、统计 |
| `Notification` | Claude 等待授权/输入时 | 转发提醒到手机/IM |
| `PreCompact` | 上下文压缩前 | 备份完整对话记录 |

## 6.3 配置结构与匹配器

写在任意层级的 `settings.json` 里（层级见 4.3 节），或用 `/hooks` 交互式配置：

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          { "type": "command", "command": "你的命令", "timeout": 30 }
        ]
      }
    ]
  }
}
```

- `matcher`：匹配**工具名**的正则（`"Edit|Write"`、`"Bash"`、`"mcp__github__.*"`；留空或 `"*"` 匹配全部）。
- 一个事件可挂多个 matcher 组，一个组可挂多个命令（并行执行）。

## 6.4 协议：stdin 进 JSON，退出码定生死

这是写 Hook 必须理解的机制。**harness 通过 stdin 给你的命令喂一份 JSON**，包含本次事件的全部信息：

```json
{
  "session_id": "abc123",
  "cwd": "/Users/zcyue/myproject",
  "hook_event_name": "PreToolUse",
  "tool_name": "Bash",
  "tool_input": {
    "command": "rm -rf build/",
    "description": "清理构建目录"
  }
}
```

（`PostToolUse` 还会多一个 `tool_response` 字段，含执行结果。）

**你的命令的退出码决定后续行为**：

| 退出码 | 含义 |
|---|---|
| `0` | 放行。stdout 在 `UserPromptSubmit`/`SessionStart` 事件中会注入上下文 |
| `2` | **阻断**。`PreToolUse` 中 = 取消该工具调用，stderr 会反馈给模型让它调整做法 |
| 其他 | 非阻断错误，stderr 展示给用户 |

更精细的控制可以输出 JSON 到 stdout（替代退出码），例如 PreToolUse 中：

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "deny",
    "permissionDecisionReason": "禁止直接修改生产配置，请走 scripts/config-change.sh"
  }
}
```

`permissionDecision` 可取 `allow`（免询问放行）/ `deny`（拒绝）/ `ask`（强制询问用户）。

## 6.5 实战配置六例

### ① 编辑后自动格式化（PostToolUse）

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "f=$(jq -r '.tool_input.file_path'); case \"$f\" in *.py) ruff format \"$f\";; *.ts|*.tsx|*.js) npx prettier --write \"$f\";; *.go) gofmt -w \"$f\";; esac; exit 0"
          }
        ]
      }
    ]
  }
}
```

从此格式永远统一，CLAUDE.md 里一个字都不用写。

### ② 保护关键文件（PreToolUse，硬拦截）

写一个独立脚本 `.claude/hooks/protect.sh`（复杂逻辑建议都用脚本文件，别挤在 JSON 里）：

```bash
#!/bin/bash
# 阻止 Claude 编辑受保护路径
input=$(cat)
file=$(echo "$input" | jq -r '.tool_input.file_path // empty')

for pattern in ".env" "migrations/" "pnpm-lock.yaml"; do
  if [[ "$file" == *"$pattern"* ]]; then
    echo "受保护文件 [$file] 禁止修改。如需变更请告知用户手动操作。" >&2
    exit 2    # 阻断，stderr 会反馈给模型
  fi
done
exit 0
```

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [{ "type": "command", "command": "bash .claude/hooks/protect.sh" }]
      }
    ]
  }
}
```

注意退出码 2 的妙处：模型会**收到原因**并调整策略（比如转而提示你手动改），而不是傻傻重试。

### ③ 完工弹系统通知（Stop）

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "osascript -e 'display notification \"任务完成\" with title \"Claude Code\" sound name \"Glass\"'"
          }
        ]
      }
    ]
  }
}
```

配上这个，你可以放心把长任务挂着去做别的事。Linux 用 `notify-send`，也可以换成调用钉钉/飞书 webhook。

### ④ 等待授权时提醒（Notification）

```json
{
  "hooks": {
    "Notification": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "osascript -e 'display notification \"Claude 在等你确认权限\" with title \"Claude Code\"'"
          }
        ]
      }
    ]
  }
}
```

解决"挂着任务去喝水，回来发现它卡在确认框等了十分钟"的问题。

### ⑤ 会话启动时注入动态上下文（SessionStart）

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "echo \"当前 sprint 任务：$(head -5 SPRINT.md 2>/dev/null)；最近部署：$(git describe --tags 2>/dev/null)\""
          }
        ]
      }
    ]
  }
}
```

退出码 0 时，stdout 会注入会话上下文——相当于"动态版 CLAUDE.md"。

### ⑥ 审计日志：记录所有执行过的命令（PreToolUse）

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '\"[\" + (now|todate) + \"] \" + .tool_input.command' >> ~/.claude/bash-audit.log; exit 0"
          }
        ]
      }
    ]
  }
}
```

## 6.6 调试与安全注意

```bash
claude --debug hooks     # 启动时开 hooks 调试日志，看每次触发的输入输出
```

- Hook 在 JSON 改动后**新会话才生效**（防运行中被篡改），`/hooks` 界面改动即时生效。
- Hook 以**你的用户权限**运行任意 shell 命令——只写自己看得懂的命令，第三方插件带的 hooks 装前先审。
- Hook 应当**快**（默认超时前完成）且**幂等**（同一事件可能多次触发）。
- 失败要兜底：上面例 ① 结尾的 `exit 0` 保证格式化器不存在时不至于阻塞流程。

---

下一章：[07 · MCP：连接外部世界](07-MCP-连接外部世界.md)
