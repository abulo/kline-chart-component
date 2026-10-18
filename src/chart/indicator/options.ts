/**
 * options.ts —— 主图 / 附图指标按钮配置（互斥选项）
 *
 * 从 App.vue 迁移（v1.7.1）：指标按钮的名称 + 标签集中在此定义，
 * 供工具栏渲染使用；主图指标互斥（MA/EXPMA/BOLL/SAR/BBI），
 * 附图指标互斥（K 线 10 个含 CR，无选中时关闭指标层）。
 */
import type { MainIndicatorType, SubIndicatorType } from './types'

/** 单个指标按钮配置：name 为指标类型（互斥联合），label 为展示名 */
export interface IndicatorOption<T extends string> {
  name: T
  label: string
}

/** 主图指标按钮配置（五个，互斥；同一时刻仅一个激活，点击已激活项 = 关闭） */
export const MainIndicatorOptions: ReadonlyArray<IndicatorOption<MainIndicatorType>> = [
  { name: 'ma', label: 'MA' },
  { name: 'expma', label: 'EXPMA' },
  { name: 'boll', label: 'BOLL' },
  { name: 'sar', label: 'SAR' },
  { name: 'bbi', label: 'BBI' },
]

/** 附图指标按钮配置（十个，互斥；无选中 = 指标层关闭） */
export const SubIndicatorOptions: ReadonlyArray<IndicatorOption<SubIndicatorType>> = [
  { name: 'rsi', label: 'RSI' },
  { name: 'kdj', label: 'KDJ' },
  { name: 'macd', label: 'MACD' },
  { name: 'wr', label: 'WR' },
  { name: 'dmi', label: 'DMI' },
  { name: 'bias', label: 'BIAS' },
  { name: 'obv', label: 'OBV' },
  { name: 'cci', label: 'CCI' },
  { name: 'roc', label: 'ROC' },
  { name: 'cr', label: 'CR' },
]
