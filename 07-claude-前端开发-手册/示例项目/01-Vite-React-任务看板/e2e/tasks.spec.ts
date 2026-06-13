// Playwright e2e —— UI 的地面真相(第4.4节)。
// 实际操作浏览器,验证用户真实路径。让 AI"跑 npm run e2e 确认",
// 或改 UI 后用 Playwright MCP 实际打开页面截图对比。

import { test, expect } from "@playwright/test";

test("用户能添加任务并标记完成", async ({ page }) => {
  await page.goto("http://localhost:5173");

  // 添加任务
  await page.getByLabel("新任务").fill("上线前端示例");
  await page.getByRole("button", { name: "添加" }).click();

  // 任务出现在列表
  await expect(page.getByText("上线前端示例")).toBeVisible();

  // 勾选完成
  const checkbox = page.getByRole("checkbox").first();
  await checkbox.check();
  await expect(checkbox).toBeChecked();
});
