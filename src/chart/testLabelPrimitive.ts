/**
 * TestLabelPrimitive.ts —— 顶部空 Pane"测试"文字 primitive（v1.4.3）
 *
 * 职责：通过 ISeriesPrimitive 挂载到 pane0 的空 series 上，自绘"测试"文字。
 * 文字规格：垂直居中、距左 6px；颜色每次 draw 动态获取（跟随主题 textColor），
 * 主题切换无需额外刷新。
 *
 * 依赖：渲染逻辑委托给 TestLabelPaneView（同目录独立文件）。
 */
import { type ISeriesPrimitive, type IPrimitivePaneView, type Time } from 'lightweight-charts'
import { TestLabelPaneView } from './TestLabelPaneView'

export class TestLabelPrimitive implements ISeriesPrimitive<Time> {
  /** 待绘制文字（只读，构造时注入） */
  public readonly text: string
  /** 文字颜色获取器（只读，draw 时动态调用以跟随主题） */
  public readonly getColor: () => string

  constructor(text: string, getColor: () => string) {
    this.text = text
    this.getColor = getColor
  }

  /** 返回本 primitive 的 pane 视图（渲染器） */
  paneViews(): readonly IPrimitivePaneView[] {
    return [new TestLabelPaneView(this)]
  }
}
