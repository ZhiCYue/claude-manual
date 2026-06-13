// 首页 —— Server Component(App Router 默认)。在服务端执行,直接 await 取数,
// 不进客户端包,没有 useEffect/loading state(第3.2节)。

import { getNotes } from "@/lib/db";
import { NoteForm } from "./notes/NoteForm";

export default async function Home() {
  const notes = await getNotes(); // 直接在组件里 await,服务端取数

  return (
    <main style={{ maxWidth: 600, margin: "2rem auto", fontFamily: "system-ui" }}>
      <h1>笔记</h1>

      {/* 需要交互的部分是 Client Component */}
      <NoteForm />

      <ul>
        {notes.map((note) => (
          <li key={note.id}>{note.text}</li>
        ))}
        {notes.length === 0 && <li>还没有笔记,写一条吧。</li>}
      </ul>
    </main>
  );
}
