// 笔记表单 —— Client Component(需要交互,所以标 "use client")。
// 用 React 19 的 useActionState 调 Server Action,自动管 pending/错误状态(第3.3节),
// 不用手写 loading/error。

"use client";

import { useActionState } from "react";
import { useRef, useEffect } from "react";
import { addNote } from "./actions";

export function NoteForm() {
  const [state, formAction, isPending] = useActionState(addNote, { error: null });
  const formRef = useRef<HTMLFormElement>(null);

  // 提交成功后清空输入框
  useEffect(() => {
    if (!isPending && state.error === null) {
      formRef.current?.reset();
    }
  }, [isPending, state]);

  return (
    <form ref={formRef} action={formAction} style={{ marginBottom: "1rem" }}>
      <input name="text" aria-label="新笔记" placeholder="写一条笔记…" />
      <button type="submit" disabled={isPending}>
        {isPending ? "保存中…" : "添加"}
      </button>
      {state.error && <p style={{ color: "crimson" }}>{state.error}</p>}
    </form>
  );
}
