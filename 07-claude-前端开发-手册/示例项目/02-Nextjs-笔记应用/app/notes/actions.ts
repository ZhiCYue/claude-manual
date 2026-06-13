// Server Actions —— 标 "use server",在服务端执行(第3.3节)。
// 客户端表单可以直接 action={addNote} 调用,React/Next 处理客户端到服务端的调用。

"use server";

import { revalidatePath } from "next/cache";
import { createNote } from "@/lib/db";

export async function addNote(_prevState: unknown, formData: FormData) {
  const text = String(formData.get("text") ?? "").trim();
  if (!text) {
    return { error: "笔记不能为空" };
  }
  await createNote(text);
  revalidatePath("/"); // 让首页重新渲染,显示新笔记
  return { error: null };
}
