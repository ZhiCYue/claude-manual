// Vitest 组件测试 —— 逻辑的地面真相(第4.4节)。
// 让 AI 改完组件"跑 npm test 确认",它就有了客观的对没对依据。

import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TaskBoard } from "./TaskBoard";

// 每个测试用新的 QueryClient,避免缓存串味
function renderWithQuery() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TaskBoard />
    </QueryClientProvider>,
  );
}

describe("TaskBoard", () => {
  beforeEach(() => localStorage.clear());

  it("能添加一个任务", async () => {
    renderWithQuery();
    const input = await screen.findByLabelText("新任务");
    await userEvent.type(input, "写测试");
    await userEvent.click(screen.getByText("添加"));

    expect(await screen.findByText("写测试")).toBeInTheDocument();
  });

  it("能切换任务完成状态", async () => {
    renderWithQuery();
    const input = await screen.findByLabelText("新任务");
    await userEvent.type(input, "可切换的任务");
    await userEvent.click(screen.getByText("添加"));

    const checkbox = await screen.findByRole("checkbox");
    expect(checkbox).not.toBeChecked();
    await userEvent.click(checkbox);
    expect(await screen.findByRole("checkbox")).toBeChecked();
  });
});
