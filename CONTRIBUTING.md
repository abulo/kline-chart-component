# 贡献指南 Contributing

感谢你对 **kline-chart-component**（Vue 3 + TypeScript + lightweight-charts v5.2.1 多 Pane K 线 / 分时图表组件）的兴趣！本文件定义贡献流程与工程约束，提交前请通读。

- 项目介绍 / 用法 / API：见 [README.md](README.md)（英文版 [README.en.md](README.en.md)）
- 许可证：[LICENSE](LICENSE)（MIT，Copyright (c) 2026 abulo）

---

## 1. 开发环境

| 项 | 要求 |
|---|---|
| Node.js | ≥ 24（开发环境锁定 24.16.0） |
| pnpm | 12.15.0（`packageManager` 字段锁定 `pnpm@12.15.0`） |
| TypeScript | 6.0.3（devDependency 锁定，`strict: true`） |

> 仓库使用 **pnpm**（锁定 `pnpm-lock.yaml`）；请勿混用 npm/yarn 生成新的锁文件。

```bash
pnpm install
```

## 2. 常用命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 开发预览 http://127.0.0.1:5199（`/api` 代理后端，`ws: true` 代理 WebSocket） |
| `pnpm type-check` | 类型检查（`vue-tsc --noEmit`，**必须零错误**） |
| `pnpm test` | 单元测试（vitest，27 文件 / 257 用例，**必须全绿**） |
| `pnpm build` | 类型检查 + 构建（`vite build`，产物 `dist/`，base `/kline-chart-component/`） |
| `pnpm preview` | 预览构建产物 http://127.0.0.1:4173/kline-chart-component/ |

## 3. 工程约束（硬性要求）

提交代码前必须满足：

- **函数 / 文件名**：驼峰命名、语义化（如 `ensureTsPool`、`symmetricExpandRange`）；类方法用箭头字段（`this` 绑实例，被库回调调用不丢 `this`）
- **文件拆分**：单个 TS 文件超过 1000 行必须拆分（如 controller、数据服务层均按此纪律拆分）
- **文件名规范**：文件名不得包含数字；仓库维护在大小写敏感文件系统上，**import 路径必须与文件名精确一致**
- **颜色集中**：所有颜色集中在 `src/chart/core/theme.ts`，页面 / 组件禁止散落硬编码色值；深浅双主题改动必须同步两套配色
- **代码注释**：函数 / 类方法必须带 JSDoc，**注明入参与出参**（`@param` / `@returns` / 返回语义，如"返回条数 < limit 表示无更早数据"）
- **内存与性能**：新增缓存必须带 LRU 上限；实时 / 事件订阅必须在 `destroy()` 中退订；定时器必须提供清理函数返回
- **类型安全**：公共数据 / 接口必须有完整类型定义，禁止 `any` 泄漏到公共 API（`ChartDataPoint` 的 `[key: string]: any` 是扩展字段的既定设计，新增字段需同步 `types/chart.ts` 注释与 README 字段表）

## 4. 测试要求

- 新增功能**必须**提供 vitest 测试用例（放在 `tests/`，文件名 `.test.ts`）
- 测试覆盖建议：正常路径 + **边界场景**（空数据、单根、分页到最左、周期切换组合）+ **内存场景**（缓存淘汰、订阅清理、重复 init/destroy）
- 指标计算（`src/chart/indicator/`）为纯函数，必须附带可复算的数值断言
- 运行 `pnpm type-check` 与 `pnpm test` 全绿后才能提交

## 5. 提交规范

### 5.1 Commit message

建议格式：

```
v<版本> <变更摘要>

- <明细 1>
- <明细 2>
```

示例：

```
v1.7.12 十字星竖线中心对齐柱体中心

- 竖线以 bar 中心浮点 x 为几何中心绘制（不再取整偏移）
- 横线保留亚像素对齐；验证：tsc 0 错误、vitest 28 文件 / 258 tests 全绿
```

### 5.2 版本号同步（每次变更必做）

1. `package.json` 的 `version` 递增（`1.7.x`）
2. `README.md` 版本记录顶部新增条目（含验证结果：tsc 错误数 + vitest 文件数/用例数）
3. `README.en.md` 的 `Version History` 同步新增英文条目
4. 涉及 API / Props / 参数变更时，同步 README 的 API / Options / Types / Examples 章节

### 5.3 分支与发布

- 主分支：`main`；push `main` 自动触发 GitHub Pages Actions 部署 https://abulo.github.io/kline-chart-component/
- 功能开发建议先开分支，合入 `main` 前 rebase 保持线性历史
- zip 交付物（`kline-chart-component-v*.zip`）**不入 git**（`.gitignore` 已排除 `*.zip`）

## 6. PR 流程

1. Fork 或新建分支，完成功能 / 修复
2. 本地验证：`pnpm type-check`（0 错误）+ `pnpm test`（全绿）
3. 补充测试用例与文档（README 版本记录、必要时 API 章节）
4. 提交 PR，标题含版本号与摘要；描述中说明：
   - 改动范围与涉及文件
   - 验证方式（命令 + 结果；涉及 UI 的行为给出操作路径与预期/实际）
   - 内存 / 性能影响（新增订阅、缓存、定时器是否泄漏）

## 7. Issue 报告

Bug 报告请包含：

- **操作路径**（如：日K → 成交量关 → 1 日分时）
- **预期行为** 与 **实际行为**
- 浏览器版本 + 截图（深 / 浅系注明）
- 浏览器控制台报错（如 `Uncaught TypeError ... at xxx.ts:157`）——报错文件与行号是定位关键
- 数据源（Mock / Http，Http 时注明实时模式 ws/sse/poll）

功能建议请说明：目标场景、期望 API 形态（Prop / 事件 / 控制器方法）、与现有功能的关系。

## 8. 路线图项（欢迎认领）

- npm 包发布形态（`package.json` 目前为 `private: true`，需配置 lib 构建 + `exports`/`types` 字段）
- `CHANGELOG.md` 是否恢复（当前版本记录内置 README，见 README 第 11 章）
- ESLint / Prettier 统一配置（当前仓库无 lint 配置，以 `vue-tsc` 类型检查为准）

---

再次感谢贡献！如有疑问，可在 Issue 中提问或直接在 PR 中讨论。
