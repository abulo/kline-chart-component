<script setup lang="ts">
/**
 * KLineChart.vue —— 图表组件（v1.5.0：数据服务集成）
 *
 * 职责：提供一个占满容器的 div，挂载 KLineChartController；
 * 将工具栏状态下沉为 Props（单向数据流），组件内部 watch Props 驱动控制器；
 * **数据层接入 src/services（ChartDataService 接口）**：
 *  - controller.init 统一拉历史 + 订阅实时（v1.6.17；首次挂载 / symbol / period / service 变化触发）
 *    → controller.setKlineData（过滤 kline 点，整体重建 + fitContent）；
 *  - 实时订阅在 controller 内部（startRealtime → updateLastBar）
 *    （同 time 覆盖最后一根 / 更大 time 追加新 K，指标增量重建）。
 *
 * Props：
 *  - symbol / name：股票代码 / 名称（pane0 信息行：名称 [代码]）；
 *  - timeAxis / leftScale / rightScale / theme / mainIndicator / subIndicator：状态开关；
 *  - 拉取条数：服务实例 fetchLimit（构造必填，如 200）；
 *  - period：当前周期（外部可控，默认 'day'；变化时重新拉取）；
 *  - service：数据服务实现（默认 MockChartDataService 单例；接入真实行情传
 *    HttpChartDataService 实例即可，组件 / 控制器零改动）。
 *
 * 生命周期（实例保护 + 内存管理）：
 *  - onMounted：controller 为空才创建（防重复挂载重复创建 chart），随后 controller.init()；
 *  - onBeforeUnmount：controller.destroy()（内部退订实时 + 使在途请求失效）并置空引用；
 *  - 数据加载竞态由 controller 内部 loadSeq 守卫（快速切换周期 / 标的丢弃过期响应）。
 */
import { onBeforeUnmount, onMounted, ref, watch, computed } from "vue";
import {
  KLineChartController,
  type MainIndicatorName,
} from "../chart/core/kLineChartController";
import type { ChartThemeName } from "../chart/core/theme";
import  { themeColors } from "../chart/core/theme";
import type { SubIndicatorType } from "../chart/indicator";
import type { PeriodValue } from "../chart/periods";
import type { ChartDataService } from "../services/chartDataService";
import type { ChartLoadStatus } from "../chart/core/types";
import { MockChartDataService } from "../services/chartDataService";

/** 默认数据服务（Mock 单例：池缓存复用，内存友好；接入后端时父组件传 HttpChartDataService） */
const defaultService = new MockChartDataService({ fetchLimit: 200 });

/** 图表组件 Props（工具栏状态 + 数据服务 单向数据流） */
/** 加载状态事件（v1.6.18）：controller.init 全流程状态通知（'loading' | 'ready' | 'error'） */
const emit = defineEmits<{
  "status-change": [status: ChartLoadStatus];
}>();

/** 当前加载状态（v1.6.21 组件内部可读：模板 / script 直接引用；变化时同步 emit） */
const loadStatus = ref<ChartLoadStatus>("idle");

const props = withDefaults(
  defineProps<{
    /** 股票代码（pane0 顶部信息行显示） */
    symbol?: string;
    /** 股票名称（pane0 顶部信息行显示） */
    name?: string;
    /** 时间轴开关（默认开） */
    timeAxis?: boolean;
    /** 左刻度区开关（默认关） */
    leftScale?: boolean;
    /** 右刻度区开关（默认关） */
    rightScale?: boolean;
    /** 风格（'dark' | 'light'，默认深系） */
    theme?: string;
    /** 主图指标（'' = 关闭；互斥单选，由父组件保证） */
    mainIndicator?: string;
    /** 附图指标（'' = 关闭指标层；互斥单选，由父组件保证） */
    subIndicator?: string;
    /** 当前周期（外部可控；变化时经 service 重新拉取该周期数据） */
    period?: PeriodValue;
    /** 数据服务（默认 MockChartDataService 单例；传 HttpChartDataService 接入真实行情） */
    service?: ChartDataService;
    /** 时间格式模板（v1.6.9）：如 'YYYY-MM-DD' / 'YYYY-MM-DD HH:mm'；缺省按周期自动 */
    format?: string;
  }>(),
  {
    symbol: "",
    name: "",
    timeAxis: true,
    leftScale: false,
    rightScale: false,
    theme: "dark",
    mainIndicator: "",
    subIndicator: "",
    period: "day",
  },
);

/** 容器 ref（需有确定宽高，由父组件 CSS 保证） */
const containerRef = ref<HTMLDivElement | null>(null);

/** 控制器实例（父组件 ref 访问：放大 / 缩小 / 左移 / 右移） */
const controller = ref<KLineChartController | null>(null);

/** 组件内当前周期（默认取 props.period；白名单按钮点击 / 外部 period 变化同步） */
const activePeriod = ref<PeriodValue>(props.period);

// v1.6.24：props.theme 为 string，需断言到 ChartThemeName（与 applyTheme 调用一致）
const theme = computed(() => themeColors(props.theme as ChartThemeName));

onMounted(() => {
  // 实例保护：仅当控制器未创建（且容器未被标记）时才创建；
  // 若已存在实例则复用（防重复挂载导致 chart 重复创建）
  if (!containerRef.value || controller.value) return;
  controller.value = new KLineChartController({
    container: containerRef.value,
    symbol: props.symbol,
    name: props.name,
    // v1.6.9：时间格式模板透传（pane0 信息行时间；缺省按周期自动）
    format: props.format,
    // v1.6.17：数据服务由组件注入（默认 Mock 兜底），controller.init 统一管理拉取 / 实时
    service: props.service ?? defaultService,
    // v1.6.21：加载状态回调 → 组件内部 loadStatus 同步 + emit 'status-change'（父组件监听）
    onStatusChange: (status) => {
      loadStatus.value = status;
      emit("status-change", status);
    },
  });
  // 创建后立即应用全部 Props 初始值（与控制器构造默认值一致时幂等无副作用）
  controller.value.applyTheme(props.theme as ChartThemeName);
  controller.value.toggleTimeAxis(props.timeAxis);
  controller.value.setLeftScaleVisible(props.leftScale);
  controller.value.setRightScaleVisible(props.rightScale);
  controller.value.setMainIndicator(
    props.mainIndicator ? (props.mainIndicator as MainIndicatorName) : null,
  );
  controller.value.setSubIndicator(
    props.subIndicator ? (props.subIndicator as SubIndicatorType) : null,
  );
  // 数据层：controller.init 统一拉历史 + 订阅实时（v1.6.17）
  void controller.value.init();
});

onBeforeUnmount(() => {
  // destroy 内部已退订实时推送（v1.6.17）
  controller.value?.destroy();
  controller.value = null;
});

/* ===== Props watch：状态变化 → 驱动控制器 / 数据层（单向数据流） ===== */
/** 时间轴开关 */
watch(
  () => props.timeAxis,
  (visible) => controller.value?.toggleTimeAxis(visible),
);
/** 左刻度区开关 */
watch(
  () => props.leftScale,
  (visible) => controller.value?.setLeftScaleVisible(visible),
);
/** 右刻度区开关 */
watch(
  () => props.rightScale,
  (visible) => controller.value?.setRightScaleVisible(visible),
);
/** 风格切换（图表主题；html 背景由父组件同步） */
watch(
  () => props.theme,
  (value) => controller.value?.applyTheme(value as ChartThemeName),
);
/** 主图指标（'' → null = 关闭） */
watch(
  () => props.mainIndicator,
  (value) =>
    controller.value?.setMainIndicator(
      value ? (value as MainIndicatorName) : null,
    ),
);
/** 附图指标（'' → null = 关闭指标层） */
watch(
  () => props.subIndicator,
  (value) =>
    controller.value?.setSubIndicator(
      value ? (value as SubIndicatorType) : null,
    ),
);
/** 外部周期变化 → 同步内部周期 + 重新 init（拉历史 + 重订阅实时，重置边缘加载状态） */
watch(
  () => props.period,
  (value) => {
    if (value === activePeriod.value) return;
    activePeriod.value = value;
    // v1.6.9：周期切换 → pane0 信息行时间格式随周期变更（setPeriod 触发重绘）
    controller.value?.setPeriod(value);
    // v1.6.17：init 统一处理竞态（loadSeq 丢弃过期响应）+ hasMoreHistory 重置
    void controller.value?.init();
  },
);
/** symbol 变化 → 重新 init（新标的；拉历史 + 重订阅实时） */
watch(
  () => props.symbol,
  () => void controller.value?.init(),
);
/** service 实例变化 → 重新 init */
watch(
  () => props.service,
  () => void controller.value?.init(),
);

/** 向父组件暴露控制器（放大 / 缩小 / 左移 / 右移等瞬时动作） */
/** 对外暴露：控制器 + 当前加载状态（父组件 chartRef.value.loadStatus 读取） */
defineExpose({ controller, loadStatus });
</script>

<template>
  <div class="kline-chart">
    <!-- 首次加载遮罩 -->
    <div v-if="loadStatus === 'loading'"
      class="kline-mask"
      :style="{
        background: theme.maskBackground,
        color: theme.maskText,
      }">
      加载中…
    </div>
    <!-- 向左加载更早历史提示 -->
    <div v-if="loadStatus === 'loading-older'"
      class="kline-older"
      :style="{
        background: theme.maskBackground,
        color: theme.maskText,
      }">
      正在加载更早数据…
    </div>
    <div ref="containerRef" class="kline-chart-container" />
  </div>
</template>

<style scoped>
.kline-chart {
  position: relative;
  width: 100%;
  height: 100%;
}

.kline-chart-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* —— 加载状态 —— */
.kline-mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  pointer-events: none;
  z-index: 4;
}
.kline-older {
  position: absolute;
  top: 5%;
  left: 50%;
  transform: translateX(-50%);
  font-size: 12px;
  pointer-events: none;
  z-index: 4;
}
</style>
