/**
 * infoLabelPaneView.ts —— 信息行文字渲染视图（无背景，v1.4.64）
 *
 * 仅绘制分段文字（不填充背景，保证十字星竖线可贯穿本 Pane）：
 * 分段逐段着色、横向连续绘制（x 用 measureText 精确推进），总起点距左 6px。
 */
import {
  type IPrimitivePaneRenderer,
  type IPrimitivePaneView,
} from 'lightweight-charts'
import { chartFont } from '../core/theme'
import { type InfoLabelPrimitive } from './infoLabelPrimitive'

export class InfoLabelPaneView implements IPrimitivePaneView {
  /** 所属 primitive（取分段文字获取器） */
  private readonly source: InfoLabelPrimitive

  constructor(source: InfoLabelPrimitive) {
    this.source = source
  }

  /** zOrder 'top' → 绘制在 pane 顶层 canvas（位于十字星之上） */
  zOrder = (): 'top'  => {
    return 'top'
  }

  /** 渲染器：分段文字（各段不同色，横向拼接，距左 6px） */
  renderer = (): IPrimitivePaneRenderer  => {
    return {
      draw: (target) => {
        target.useMediaCoordinateSpace(({ context, mediaSize }) => {
          context.font = chartFont
          context.textBaseline = 'middle'
          context.textAlign = 'left'
          let x = 6
          for (const segment of this.source.getSegments()) {
            context.fillStyle = segment.color
            context.fillText(segment.text, x, mediaSize.height / 2)
            // 用 measureText 精确推进 x，保证各段首尾相接、无重叠无空隙
            x += context.measureText(segment.text).width
          }
        })
      },
    }
  }
}
