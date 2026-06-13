# 第 2 章 · webpack + React 实战

这一章给确实在用 webpack 的人:现代 webpack 5 的配置要点、性能优化、微前端(Module Federation),以及何时该考虑迁移。如果你是全新项目且没有微前端/深度定制需求,第 1 章已经建议你用 Vite——可以跳过本章。

---

## 2.1 现代 webpack 5 配置要点

如果你在维护或搭建 webpack + React 项目,这些是当前(webpack 5)的核心实践。

### 用更快的编译器替代 babel-loader

webpack 慢,很大一部分在 JS/TS 转译。**用 `swc-loader` 或 `esbuild-loader` 替代 `babel-loader`**——快一个数量级:

```js
// webpack.config.js（节选）
module.exports = {
  module: {
    rules: [
      {
        test: /\.[jt]sx?$/,
        exclude: /node_modules/,
        use: {
          loader: "swc-loader",   // 比 babel-loader 快很多
        },
      },
    ],
  },
};
```

### 用内置 Asset Modules,别再用 file-loader

webpack 5 内置了资源处理,**不要再装 file-loader/url-loader**(已过时):

```js
{
  test: /\.(png|jpg|svg|gif)$/,
  type: "asset/resource",   // webpack 5 内置
}
```

### CSS 处理

```js
// 开发用 style-loader(注入),生产用 MiniCssExtractPlugin(抽成文件)
{
  test: /\.css$/,
  use: [
    isProd ? MiniCssExtractPlugin.loader : "style-loader",
    "css-loader",
  ],
}
```

### 输出用 contenthash 做长效缓存

```js
output: {
  filename: "[name].[contenthash].js",   // 内容变才变文件名 → 浏览器长效缓存
  clean: true,                           // webpack 5 内置,替代 clean-webpack-plugin
}
```

## 2.2 性能优化(生产)

webpack 项目的性能,主要在这几块:

### 代码分割 + 路由级懒加载

用动态 `import()` + `React.lazy`/`Suspense`,把路由拆成按需加载的 chunk:

```jsx
import { lazy, Suspense } from "react";
const Dashboard = lazy(() => import("./pages/Dashboard"));

function App() {
  return (
    <Suspense fallback={<Loading />}>
      <Dashboard />
    </Suspense>
  );
}
```

webpack 看到动态 `import()` 会自动拆 chunk,首屏只加载需要的。

### 拆分 vendor

```js
optimization: {
  splitChunks: {
    chunks: "all",   // 把 node_modules 里的依赖拆成单独的 vendor chunk
  },
}
```

vendor(第三方库)单独成 chunk,你的业务代码改动不会让用户重新下载没变的依赖(配合 contenthash)。

### Tree Shaking

确保:`mode: "production"`(自动开启)、用 ES 模块(`import`/`export`)、`package.json` 里 `sideEffects` 配置正确。这样没用到的代码会被摇掉。

### 用 Bundle Analyzer 揪体积大户

```bash
npm install -D webpack-bundle-analyzer
```

```js
const { BundleAnalyzerPlugin } = require("webpack-bundle-analyzer");
plugins: [new BundleAnalyzerPlugin()]   // 跑构建后打开可视化,看谁占体积
```

这是优化包体的第一步:先看见哪个依赖大,再决定怎么办(换轻量库、懒加载、按需引入)。

## 2.3 开发体验

```js
devServer: {
  hot: true,           // HMR 热更新
  port: 3000,
},
devtool: isProd
  ? "source-map"                    // 生产:完整 source map(或按需关闭)
  : "eval-cheap-module-source-map", // 开发:快且够用
```

> 即便优化到位,webpack 的开发服务器仍比 Vite 慢——这是架构差异(webpack 开发时也打包,Vite 不打包)。如果开发慢已经严重拖累团队,这是评估迁移到 Vite 的信号(2.5 节)。

## 2.4 微前端:Module Federation

这是 webpack 在 2026 仍不可替代的场景。Module Federation 让多个独立部署的应用在运行时共享代码:

```js
// 应用 A 暴露组件
new ModuleFederationPlugin({
  name: "app_a",
  filename: "remoteEntry.js",
  exposes: { "./Button": "./src/Button" },
  shared: ["react", "react-dom"],   // 共享依赖,避免重复加载
});

// 应用 B 消费
new ModuleFederationPlugin({
  name: "app_b",
  remotes: { app_a: "app_a@http://localhost:3001/remoteEntry.js" },
  shared: ["react", "react-dom"],
});
```

如果你的团队在做微前端,Module Federation 的成熟度是留在 webpack 的充分理由。(Vite 也有模块联邦插件,生态在追赶,但 webpack 仍是这一领域最稳的。)

## 2.5 何时该考虑迁移到 Vite

不为赶时髦迁移,但出现这些信号时值得评估:

- **开发服务器慢到拖累团队**:每次启动几十秒、HMR 卡顿,严重影响迭代和 AI 辅助的反馈循环。
- **webpack config 维护成本高**:一坨没人敢动的自定义配置,新人(和 AI)都看不懂。
- **没有微前端/深度定制的硬需求**:当初用 webpack 的理由已不成立。

迁移建议:

- 用 Plan Mode(第一册第 4 章)让 Claude Code 先调研现状、出迁移计划,审完再动手。
- 增量迁移,先在一个子应用/包上试。
- 迁移本身是个适合规格驱动的任务(第 6–7 章):先写清"迁移后要满足什么"的 spec,再让 AI 执行。

## 2.6 让 AI 帮你搞 webpack 配置的注意点

webpack 配置是 AI 容易给过时建议的重灾区(第 0.6 节)。让 Claude Code 改 webpack 配置时:

- **警惕过时方案**:它可能建议 file-loader(应用 asset modules)、babel-loader(可换 swc)、clean-webpack-plugin(webpack 5 内置 `clean: true`)。
- **给它当前版本**:在 prompt 或 CLAUDE.md 里说明"webpack 5,用 swc-loader 和内置 asset modules"。
- **改完验证**:让它跑构建、跑 bundle analyzer,确认没把包体搞大、没破坏 HMR。

## 2.7 webpack + React 检查清单

- [ ] 用 swc-loader / esbuild-loader 替代 babel-loader
- [ ] 用 webpack 5 内置 asset modules,不用 file-loader
- [ ] output 用 [contenthash] + `clean: true`
- [ ] 路由级懒加载(动态 import + React.lazy/Suspense)
- [ ] splitChunks 拆 vendor
- [ ] 定期跑 bundle analyzer 揪体积大户
- [ ] 微前端用 Module Federation
- [ ] 开发慢到拖累团队 → 评估迁移 Vite(用 Plan Mode + spec 驱动)
- [ ] 让 AI 改配置时警惕过时方案,改完验证构建

---

下一章：[03 · React 现代模式](03-React现代模式.md)
