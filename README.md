# dsh-abap-editor

> ABAP syntax highlighting for the DeepSeek Harness document preview.

给 DSH 官方侧边栏的**文档预览**（`@deepseek-ai/dsh-client-ui-sidebar-documentpreview`）加一个
**ABAP 渲染器**：`.abap` 文件用 CodeMirror 6 打开，带 ABAP 语法高亮、行号、跟随主题的明暗配色。
只读——官方的文档预览本身没有写入通道。

## 为什么需要它

官方预览给「代码」渲染器一份**编译进包里的**扩展名→语言表（25 种语言）：

- 表里**没有** `abap`，共享高亮器（shiki）也只装入那 25 种语法；
- 插件无法给内置渲染器加语言，只能走官方公开的扩展点，用自己的正文组件接管 `.abap`。

所以未装插件时 `.abap` 落到纯文本兜底（纯文本、代码、Markdown 三个内置正文都在同一个下拉里）。

## 安装

```sh
git clone <本仓库> && cd dsh-abap-editor
pnpm install       # 仓库的 lock 是 pnpm 的；用 npm 也能装，只是 pnpm-workspace.yaml 的设置不生效
dsh plugin --profile desktop add link:<本仓库路径>
```

`lib/` 已随仓库提交，所以只装来用的话**不需要先构建**；上面的 `install` 只有在你打算改
`src/` 并重建时才需要。

装完**必须重启 DSH**（新 bundle 要挂载 host 半）。之后只改 client 半的话，重新 `npm run build`
+ 浏览器硬刷新（Ctrl+Shift+R）即可。`link:` 安装是符号链接，源码改动重新构建后直接生效，不必重装。
卸载：`dsh plugin --profile desktop remove dsh-abap-editor`。

要求 Node ≥ 20。

## 能力对照

| | 本插件 | 内置「代码」/纯文本 |
|---|---|---|
| ABAP 语法着色 | ✅ 自带 ABAP parser（CodeMirror StreamLanguage） | ❌ 语言表无 abap，纯文本 |
| 行号 / 明暗主题跟随 | ✅ | 代码渲染器 ✅ / 纯文本 ❌ |
| 换行开关 | ✅ 跟随预览头部开关 | 代码渲染器 ✅ |
| 编辑 / 保存 | ❌（官方预览无写入通道） | ❌ |
| 无限制大文件 | ⚠️ 与官方一致：按页加载，滚到底自动续读 | 同 |

**字体**：拉丁字符用 Cascadia Code，中文回退微软雅黑（Cascadia Code 不含中文字形），见 `theme.js` 的 `MONO_FONT`。

**主题**：编辑区表面（文字、光标、行号、选中）走 DSH 令牌 `--dsw-alias-label-primary` / `--dsw-alias-label-tertiary`，跟随应用主题与皮肤；语法色是常规 one-light / one-dark 调色板，字号 13px。

## 扩展点

官方每个预览实现在两处注册，**id 必须一致**（预览按选中实现的 id 去取正文）：

```js
ctx.documentPreviews.register({ id, extensions: ['abap'], priority: 'extension', title, loading: 'text-pages', wrap: true })
ctx.slots.inject('sidebar.right.tab.document', () => ctx.slots.register({ name: 'sidebar.right.tab.document', key: id }, AbapPreview))
```

- 匹配规则（`matchingDocumentPreviews`）：`priority !== 'builtin'` 的一档优先，然后按更长后缀、再按注册顺序。内置「代码」是 `builtin`，所以本插件是 `.abap` 的默认渲染器，用户仍可在下拉里切回纯文本。
- 正文组件收到 `{ resourceAddress, content, wrap, scrollportRef, t, useTabInfo, useResource }`。`content` 是 `{ kind: 'text', text, pages, eof }`——**累计的文本页前缀**，不是整份文件：`scrollportRef` 注册你自己的滚动元素（本插件注册 CodeMirror 的 `.cm-scroller`），owner 便能在滚到底时自动翻下一页、并记住滚动位置。
- 不支持行号定位（`openResource(..., { params: { line } })`）——owner 的行滚动按纯文本行高估算，与 CodeMirror 的布局不一致。

## 关于解析器

早先版本 vendor 了 `codemirror-abap@0.2.4`（2022 年后未更新），它保留字表短且过时、不认反引号字符串、没有字符串模板、操作符会一路吃到空格。现在 `src/client/abap-mode.js` 是**自研实现**，规则对齐 [Prism 的 ABAP grammar](https://github.com/PrismJS/prism/blob/master/components/prism-abap.js)（最准确的公开实现），改写成 CodeMirror 的单遍流式接口：

- 保留字取自 Prism（`scripts/gen-keywords.mjs` 提取，865 词），大小写不敏感；
- 注释：第 1 列 `*`、任意位置 `"`、`##pragma`；
- 字面量：`'...'`、`` `...` ``（双写引号转义）、`|...|` 字符串模板（含 `{ 表达式 }`，可跨行）；
- 符号操作符要求两侧空白（ABAP 语法本身如此），所以 `foo-bar` 是「名字 + 令牌操作符」而不是减法；
- 令牌操作符 `-`/`->`/`=>`/`~`/`[]` 紧贴标识符。

对 Prism 的两处修正（`tests/compare-prism.mjs` 跑真实文件发现）：

1. **单字母条目**：Prism 表里的 `C`/`E`/`I`/`M`/`O`/`X`/`Y`/`Z` 是伪字段缩写，保留会把每个叫 `x`/`y`/`i` 的变量染成关键字——生成时剔除。
2. **位置检查**：Prism 用 `(\s|\.|^)` / `(?![\w-])` 限定关键字；本实现同样要求前一个字符是空白或 `.,():;=`、后一个字符不是标识符字符，否则 `lo_obj->data` 里的 `data` 会被误染。

在一个 1216 行的真实 ABAP 类文件上的分布对比：

| | Prism | 本插件 |
|---|---|---|
| 注释 | 168 | 168 |
| 关键字 | 1281 | 1269 |
| 数字 | 30 | 30 |
| 操作符 | 355 | 348 |
| 字符串 | 85 + 模板 51 | 122 |

（Prism 的 `token-operator` 385 与本实现的 `punctuation` 属同一类，仅分类口径不同。）

## 开发

```sh
pnpm build             # esbuild → lib/client.js（单文件 __ModuleLoader__ 包装，minified ≈ 270KB）
pnpm test              # tests/smoke.mjs：加载产物、断言注册契约与语法，无测试框架
pnpm gen:keywords      # 从 node_modules/prismjs 重新提取保留字表
node tests/compare-prism.mjs <某个 .abap 文件>   # 与 Prism 的 token 分布对比
```

`lib/client.js` 是构建产物，**不要手改**；改了 `src/` 之后重新 `npm run build` 并把产物一起提交
（仓库里带着产物，使用者才能 clone 即用）。

构建要点（见 `scripts/build.mjs`）：

- client 半必须是 `window.__ModuleLoader__.load({ id, factory })` 的单文件 CommonJS 包装——DSH 每个插件只服务一个文件，不能代码分割、不能带独立 `.css`（样式在 `src/client/index.jsx` 里内联注入）。
- `react` 保持 external（宿主提供唯一实例）；`@codemirror/*` 等必须打进 bundle。
- 打包体积主要是 CodeMirror 6 本身；只读预览不需要 `@codemirror/commands` 与 `@codemirror/search`。

`pnpm-workspace.yaml` 里显式拒绝了 esbuild 的构建脚本（`allowBuilds: esbuild: false`）：它的
postinstall 只做二进制版本校验，拒绝后 `pnpm install` 更干净，而 `pnpm build` 走的是 esbuild 的
JS API，不受影响。

## 结构

| 文件 | 职责 |
|---|---|
| `package.json` | `exports` 双半、`dsh.bundle.patch`、`dsh.client.platform` |
| `cordis.patch.yml` | 把本包插入 profile 的 bundle 层 |
| `lib/index.js` | host 半：空 `apply`（预览只在浏览器里工作） |
| `lib/client.js` | 构建产物：浏览器半 |
| `src/client/abap-mode.js` | 自研 ABAP 流式解析器（CodeMirror 6 `StreamParser`） |
| `src/client/abap-keywords.js` | 保留字表（生成物，来自 Prism） |
| `src/client/editor.jsx` | 只读 CodeMirror 6 正文：扩展装配、分页追加、scrollport 注册 |
| `src/client/theme.js` | 字体栈、DSH 令牌表面 spec、one-light/one-dark 语法色、明暗检测 |
| `src/client/index.jsx` | 注册 `documentPreviews` 实现 + 同名 slot 正文 + 样式注入 |
| `scripts/build.mjs` | esbuild + `__ModuleLoader__` 包装 |
| `scripts/gen-keywords.mjs` | 从 Prism 的 grammar 重新生成保留字表 |
| `tests/smoke.mjs` | 最小可运行检查 |
| `tests/compare-prism.mjs` | 与 Prism 的 token 分布对比（诊断用） |

`src/client/abap-keywords.js` 由 `npm run gen:keywords` 生成，不要手改。

## 许可

MIT。保留字表提取自 [Prism](https://github.com/PrismJS/prism)（MIT）；运行时打包 [CodeMirror 6](https://codemirror.net/) 与 `@lezer/highlight`（均为 MIT）。
