# 单 Pane K 线组件（Vue3 + TypeScript + lightweight-charts v5）

> **当前版本：v1.4.11（2026-10-12）**
> 版本号遵循语义化版本（主.次.修订），同步于 `package.json` version、源码头部
> `@version` 注释、CHANGELOG.md，交付 zip 文件名带版本号。
> **交付规范**：每个版本交付时必须在回复中附带**运行截图**
> （浏览器实拍，覆盖深系 / 浅系及关键交互状态），截图与 zip 一并呈现。

单 Pane K 线组件：一个 chart 内 **1 个 Pane**（K 线主图）。
v1.2.0 在 v1.1.0（2 Pane）基础上收敛：删除成交量 Pane，仅保留 K 线主图；
栅格化与左右刻度区保持关闭。v1.3.0 起 K 线为红涨绿跌，上涨柱体空心（填充背景色 + 红色边框/影线），下跌柱体绿色实心。

---

## 一、布局结构

单 chart 内 1 个 Pane（Lightweight Charts v5 多 Pane 的 pane0）：

```
┌────────────────────────────────────┐
│ pane0  K 线主图（Candlestick）      │
└────────────────────────────────────┘
    底部：共享时间轴（timeScale）
```

- **无栅格线**（`grid.vertLines / horzLines` 全部隐藏）；
- **无左右刻度区**（`leftPriceScale / rightPriceScale` 全部隐藏，数据区铺满）；
- 高度 = 容器 100%（`autoSize` 自动适配）。

## 二、全局控制（App.vue 工具栏）

| 按钮 | 功能 |
|---|---|
| 时间轴开/关 | 底部时间轴显示 / 隐藏（`timeScale.visible`） |
| 缩小 / 放大 | X 轴 `barSpacing` 全局缩放（限幅 2~80） |
| 浅系 / 深系 | 主题切换（颜色全集中在 `chart/theme.ts`） |

图表内禁止滚轮 / 双指 / 拖轴缩放（`handleScale` 全关），缩放仅由按钮控制；
平移保留。

## 三、目录结构

```
src/
├── App.vue                    # 工具栏 + 容器（80% 宽高居中）
├── main.ts                    # 入口
├── components/
│   └── KLineChart.vue         # 图表组件（挂载控制器，expose controller）
├── chart/
│   ├── KLineChartController.ts# 控制器：K 线创建 / 主题 / 缩放 / 时间轴
│   ├── mock.ts                # mock 数据（日 K）
│   └── theme.ts               # 深系 / 浅系主题（所有颜色集中）
└── types/
    └── chart.ts               # 统一数据点类型（保留，供后端接入）
tests/
├── mock.test.ts               # mock 数据单测
├── theme.test.ts              # 主题单测
└── multipane.test.ts          # 布局常量 / K 线数据单测
```

## 四、运行

```bash
npm install        # 固定版本：lightweight-charts 5.2.1 / vue 3.5.43
npm run dev        # 开发（http://127.0.0.1:5210）
npm run test       # vitest 单测
npm run build      # vue-tsc 类型检查 + 构建
```

## 五、固定依赖版本

```json
"dependencies": {
  "lightweight-charts": "5.2.1",
  "vue": "3.5.43"
},
"devDependencies": {
  "@vitejs/plugin-vue": "6.0.9",
  "typescript": "5.9.3",
  "vite": "8.3.4",
  "vitest": "^5.0.3",
  "vue-tsc": "3.3.12"
}
```

## 六、后续规划（用户逐步提出）

- 附图指标（RSI / KDJ / MACD / WR / DMI / BIAS / OBV / CCI / ROC / CR）
- K 线主图指标（MA / EXPMA / BOLL / SAR / BBI）
- 分时线（1d~5d）与周期切换
- 十字星、信息行、浮层、数据服务（HTTP / SSE / WebSocket）
