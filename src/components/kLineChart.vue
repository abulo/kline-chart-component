<script setup lang="ts">
/**
 * KLineChart.vue —— 图表组件（v1.0.0 重构）
 *
 * 职责：提供一个占满容器的 div，挂载 KLineChartController；
 * 通过 expose 向父组件（App.vue）暴露控制器实例，供工具栏调用
 * （时间轴开关 / 缩放 / 主题切换）。
 *
 * 生命周期（实例保护）：
 *  - onMounted：controller.value 为空才创建（防组件重复挂载重复创建 chart）；
 *    控制器内部再对容器打 dataset 标记（构造时校验，destroy 时清除）；
 *  - onBeforeUnmount：销毁控制器并置空引用（防内存泄漏）。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { KLineChartController } from '../chart/kLineChartController'

/** 容器 ref（需有确定宽高，由父组件 CSS 保证） */
const containerRef = ref<HTMLDivElement | null>(null)

/** 控制器实例（父组件通过 ref 访问） */
const controller = ref<KLineChartController | null>(null)

onMounted(() => {
  // 实例保护：仅当控制器未创建（且容器未被标记）时才创建；
  // 若已存在实例则复用（防重复挂载导致 chart 重复创建）
  if (!containerRef.value || controller.value) return
  controller.value = new KLineChartController({ container: containerRef.value })
})

onBeforeUnmount(() => {
  controller.value?.destroy()
  controller.value = null
})

/** 向父组件暴露控制器 */
defineExpose({ controller })
</script>

<template>
  <!-- 图表容器 -->
  <div ref="containerRef" class="kline-chart-container" />
</template>

<style scoped>
.kline-chart-container {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
