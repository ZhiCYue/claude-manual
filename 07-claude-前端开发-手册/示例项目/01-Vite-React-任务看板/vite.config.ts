/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite 配置极简(对比 webpack 一大坨,第1章)。
// 要启用 React Compiler(第3.5节,自动 memo),按当前官方文档给
// @vitejs/plugin-react 加 babel-plugin-react-compiler —— 配置在演进,以官方为准。
export default defineConfig({
  plugins: [react()],
  // Vitest 配置(和 Vite 共用一份配置,这也是 Vite 生态的便利)
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["@testing-library/jest-dom/vitest"],
  },
});
