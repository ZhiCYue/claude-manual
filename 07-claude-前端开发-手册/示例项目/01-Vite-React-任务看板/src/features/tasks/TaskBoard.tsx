// 任务看板组件 —— 函数组件 + hooks,逻辑都在 useTasks 里,组件保持简洁(第3.7节)。
// 不手动 memo(React Compiler 处理,第3.5节)。

import { useState, type FormEvent } from "react";
import { useTasks, useAddTask, useToggleTask } from "./useTasks";

export function TaskBoard() {
  const { data: tasks, isLoading, error } = useTasks();
  const addTask = useAddTask();
  const toggleTask = useToggleTask();
  const [title, setTitle] = useState("");

  function handleAdd(e: FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) return;
    addTask.mutate({ title: trimmed });
    setTitle("");
  }

  if (isLoading) return <p>加载中…</p>;
  if (error) return <p>出错了:{String(error)}</p>;

  return (
    <section>
      <h1>任务看板</h1>

      <form onSubmit={handleAdd}>
        <input
          aria-label="新任务"
          placeholder="输入任务后回车"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button type="submit" disabled={addTask.isPending}>
          {addTask.isPending ? "添加中…" : "添加"}
        </button>
      </form>

      <ul>
        {tasks?.map((task) => (
          <li key={task.id}>
            <label>
              <input
                type="checkbox"
                checked={task.done}
                onChange={() => toggleTask.mutate(task.id)}
              />
              <span style={{ textDecoration: task.done ? "line-through" : "none" }}>
                {task.title}
              </span>
            </label>
          </li>
        ))}
        {tasks?.length === 0 && <li>还没有任务,添加一个吧。</li>}
      </ul>
    </section>
  );
}
