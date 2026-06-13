// TanStack Query hooks —— 状态三分法的"服务端状态"那一格(第3.6节)。
// 服务端数据用 useQuery/useMutation 管,自动处理缓存/加载/错误/重取,
// 绝不塞进 Zustand/Redux 这类全局 store。

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { fetchTasks, addTask, toggleTask } from "./api";

const TASKS_KEY = ["tasks"] as const;

// 读:列出所有任务。自动管 loading/error/缓存。
export function useTasks() {
  return useQuery({ queryKey: TASKS_KEY, queryFn: fetchTasks });
}

// 写:添加任务。成功后让缓存失效 → 自动重新拉取最新列表。
export function useAddTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: addTask,
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}

// 写:切换完成状态。同样靠失效缓存来刷新。
export function useToggleTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: toggleTask,
    onSuccess: () => qc.invalidateQueries({ queryKey: TASKS_KEY }),
  });
}
