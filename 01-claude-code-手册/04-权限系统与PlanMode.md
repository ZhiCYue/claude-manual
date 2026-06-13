# 第 4 章 · 权限系统与 Plan Mode

权限系统是"放心让 AI 干活"的基础设施。本章覆盖：四种模式、规则语法大全、配置文件层级、Plan Mode 实战。

## 4.1 四种权限模式

按 `Shift+Tab` 在会话中循环切换（状态栏会显示当前模式）：

| 模式 | 文件编辑 | 命令执行 | 适用场景 |
|---|---|---|---|
| **default** | 询问 | 询问 | 默认；不熟悉的项目；高危环境 |
| **acceptEdits** | ✅ 自动 | 询问 | 信任度高的日常开发（最常用的工作档） |
| **plan** | ❌ 禁止 | ❌ 禁止（只读操作除外） | 调研、出方案、审代码 |
| **bypassPermissions** | ✅ 自动 | ✅ 自动 | **仅限**无敏感数据的隔离环境（容器/VM） |

启动时指定：`claude --permission-mode plan`。

## 4.2 权限规则语法大全

被询问时选「Always allow」会自动落盘成规则；也可以手写。规则格式：`工具名` 或 `工具名(参数模式)`。

### Bash 规则（前缀匹配）

```json
"Bash(git status)"        // 精确：只允许 git status
"Bash(git diff *)"        // 前缀：git diff 开头的任何命令
"Bash(npm run test*)"     // npm run test、npm run test:unit 等
"Bash(rm -rf *)"          // 放进 deny：永久禁止
```

注意 `Bash(git *)` 这种宽前缀要慎用——`git push --force` 也会被放行。**宁可多写几条窄规则**。

### 文件规则（gitignore 风格路径）

```json
"Read(**)"                 // 允许读工作区内一切
"Read(~/.zshrc)"           // 家目录下指定文件
"Edit(src/**)"             // 只允许编辑 src 下
"Edit(//etc/hosts)"        // 双斜杠开头 = 绝对路径
"Read(.env)"               // 放进 deny：保护机密文件
"Read(secrets/**)"
```

### 网络与 MCP 规则

```json
"WebFetch(domain:docs.python.org)"     // 只允许抓取指定域名
"mcp__playwright__*"                   // 允许某 MCP 服务器的全部工具
"mcp__github__create_issue"            // 只允许其中一个工具
```

### 三个级别：allow / ask / deny

```json
{
  "permissions": {
    "allow": [ ... ],   // 免询问放行
    "ask":   [ ... ],   // 强制询问（即使别的规则放行了）
    "deny":  [ ... ]    // 无条件拦截，优先级最高
  }
}
```

> **原理**：deny 在 harness 层执行，**模型说什么都没用**——即使它被网页上的恶意提示词注入诱导去读 `.env`，调用也会被程序拦截。这就是"确定性安全"和"指望模型自觉"的区别。把真正不可逾越的红线全部写进 deny。

## 4.3 配置文件的层级与优先级

优先级从高到低：

```
1. 企业管理策略（IT 下发，不可覆盖）
2. 命令行参数（--allowedTools 等，本次会话有效）
3. 项目/.claude/settings.local.json   （个人本地，git 忽略）
4. 项目/.claude/settings.json         （团队共享，进 git）
5. ~/.claude/settings.json            （用户全局）
```

一份实用的团队配置示例（`项目/.claude/settings.json`）：

```json
{
  "permissions": {
    "allow": [
      "Read(**)",
      "Edit(src/**)",
      "Edit(tests/**)",
      "Bash(git status)",
      "Bash(git diff *)",
      "Bash(git log *)",
      "Bash(npm test *)",
      "Bash(npm run lint*)",
      "Bash(npm run build)"
    ],
    "ask": [
      "Bash(git push *)",
      "Bash(npm install *)"
    ],
    "deny": [
      "Read(.env*)",
      "Read(secrets/**)",
      "Edit(migrations/**)",
      "Bash(rm -rf *)",
      "Bash(git push --force*)"
    ]
  }
}
```

效果：日常开发零打扰，推送和装依赖必须人工确认，机密文件和已固化的迁移脚本绝对碰不到。

> **省事技巧**：内置 skill `/fewer-permission-prompts` 会扫描你的历史会话，统计最常被询问的安全操作，自动生成一份 allowlist 建议。

## 4.4 Plan Mode 深度实战

### 是什么

Plan Mode 下 Claude 被限制为**只读**：能读文件、搜代码、查文档，不能写文件、不能执行有副作用的命令。它的产出是一份**实施计划**，经你批准后才退出只读状态开始动手。

### 为什么有效（原理）

执行中途的模型有"惯性"——前面的选择会锁死后面的路径，错了很难自己掉头。Plan Mode 把「理解 → 决策 → 执行」强制分离：

1. 只读阶段它**必须**先建立全局理解（因为没别的事可做）；
2. 你在动手前审阅计划——这是整个流程中**纠错成本最低的时点**：改计划是改几句话，改写歪的代码是回滚一堆 diff。

### 完整示例

```
（Shift+Tab 切到 plan 模式，状态栏显示 ⏸ plan mode）

> 我想把用户认证从 session 改成 JWT。先调研现状，给出实施方案，
  要考虑：现有已登录用户的平滑过渡、refresh token 的存储、对移动端 API 的影响

（Claude 只读地翻代码、查依赖，几分钟后输出：）

  ## 现状
  - session 存 Redis，中间件在 src/middleware/auth.ts
  - 移动端走同一套 cookie 机制（这是迁移的主要风险点）……

  ## 实施计划
  1. 引入 jose 库，新增 src/auth/jwt.ts（签发/校验，access 15min + refresh 7d）
  2. 新增 /auth/refresh 端点，refresh token 存 httpOnly cookie
  3. 中间件改为双轨：先验 JWT，失败回落 session（过渡期 30 天）
  4. 移动端：登录响应体里同时返回 token（向后兼容字段不删）
  5. 测试：补 12 个用例，覆盖过期/篡改/双轨回落
  风险：…… 回滚方案：……

（界面弹出批准选项：批准并执行 / 继续讨论修改）

> 第 3 步的双轨期改成 14 天，另外 refresh token 要支持主动吊销

（计划更新 → 你批准 → 自动退出 plan 模式，开始按计划执行）
```

### 使用准则

- **该用**：重构、新功能、不熟的代码库、影响面大的改动、你说不清做法只能说清目标的任务。
- **不必用**：改个文案、修个明确的小 bug——直接干更快。
- 经验阈值：预计 Claude 要动 3 个以上文件，就值得先 plan。

## 4.5 关于 `--dangerously-skip-permissions`

```bash
claude --dangerously-skip-permissions   # 跳过一切权限检查
```

只应在**没有敏感数据、可随时销毁的隔离环境**（Docker 容器、一次性 VM、断网沙箱）里使用，配合自动化跑批任务。在日常开发机上用它，等于把 0.6 节的纵深防御拆到只剩"模型自觉"一层。更好的替代方案：第 9 章的 `--allowedTools` 精确授权。

---

下一章：[05 · 自定义命令与 Skills](05-自定义命令与Skills.md)
