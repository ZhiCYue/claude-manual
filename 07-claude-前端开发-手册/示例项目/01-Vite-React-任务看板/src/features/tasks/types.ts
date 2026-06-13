// 任务的类型定义 —— 类型即文档(第4.5节),枚举用联合类型,AI 不会瞎填。

export interface Task {
  id: string;
  title: string;
  done: boolean;
}

// 新建任务时的输入(没有 id/done)
export type NewTask = Pick<Task, "title">;
