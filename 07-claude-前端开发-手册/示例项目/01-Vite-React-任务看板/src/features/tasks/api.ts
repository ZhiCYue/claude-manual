// 模拟的异步 API —— 让示例无需后端就能跑。
// 真实项目里把这里换成 fetch/axios 调你的后端;上层(useTasks)完全不用改。

import type { Task, NewTask } from "./types";

// 用 localStorage 做持久化,模拟"服务端数据"
const KEY = "task-board:tasks";

function read(): Task[] {
  const raw = localStorage.getItem(KEY);
  return raw ? JSON.parse(raw) : [];
}

function write(tasks: Task[]): void {
  localStorage.setItem(KEY, JSON.stringify(tasks));
}

// 模拟网络延迟,让加载态可见
const delay = (ms = 200) => new Promise((r) => setTimeout(r, ms));

export async function fetchTasks(): Promise<Task[]> {
  await delay();
  return read();
}

export async function addTask(input: NewTask): Promise<Task> {
  await delay();
  const task: Task = { id: crypto.randomUUID(), title: input.title, done: false };
  write([...read(), task]);
  return task;
}

export async function toggleTask(id: string): Promise<Task> {
  await delay();
  const tasks = read();
  const task = tasks.find((t) => t.id === id);
  if (!task) throw new Error(`任务不存在: ${id}`);
  task.done = !task.done;
  write(tasks);
  return task;
}
