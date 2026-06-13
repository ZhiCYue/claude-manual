// 模拟数据层(进程内) —— 让示例无需真实数据库就能跑。
// 真实项目里换成 Prisma/Drizzle 调真实 DB;上层(Server Component / Action)不用改。

export interface Note {
  id: string;
  text: string;
  createdAt: string; // ISO 8601
}

// 进程内存储(重启会清空,仅供演示)
const notes: Note[] = [
  { id: "1", text: "试试 Next.js 的 Server Components", createdAt: new Date().toISOString() },
];

// 模拟异步(真实 DB 调用也是异步)
const delay = (ms = 100) => new Promise((r) => setTimeout(r, ms));

export async function getNotes(): Promise<Note[]> {
  await delay();
  return [...notes].reverse(); // 新的在前
}

export async function createNote(text: string): Promise<Note> {
  await delay();
  const note: Note = { id: crypto.randomUUID(), text, createdAt: new Date().toISOString() };
  notes.push(note);
  return note;
}
