// 入口 —— 设置 TanStack Query 的 Provider。
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TaskBoard } from "./features/tasks/TaskBoard";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TaskBoard />
    </QueryClientProvider>
  </StrictMode>,
);
