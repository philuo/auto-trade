/**
 * 操作理由记录器
 *
 * 记录每次交易的详细理由，用于事后分析和优化
 */

import type { AggregatedSignal } from '../statistics/aggregator';

/**
 * 操作理由记录
 */
export interface TradeReason {
  /** 币种 */
  coin: string;
  /** 操作 */
  action: 'BUY' | 'SELL' | 'HOLD';
  /** 时间戳 */
  timestamp: number;
  /** 价格 */
  price: number;

  /** 主要理由 */
  primaryReason: string;

  /** 触发的信号 */
  triggeredSignals: Array<{
    type: string;
    strength: number;
    description: string;
  }>;

  /** 市场状态 */
  marketState: {
    trend: string;
    volatility: string;
    adx?: number;
    rsi?: number;
    price?: number;
  };

  /** 置信度 */
  confidence: {
    overall: number;
    statistical: number;
    market: number;
    execution: number;
  };

  /** 风险参数 */
  risk: {
    stopLossDistance: number;
    takeProfitDistance: number;
    positionSize: number;
    riskLevel: string;
  };
}

/**
 * 操作理由记录器
 */
export class TradeReasonLogger {
  private reasons: TradeReason[] = [];
  private maxReasons = 1000; // 最多保存1000条记录

  /**
   * 记录一次交易
   */
  logTrade(params: {
    signal: AggregatedSignal;
    marketState: {
      trend: string;
      volatility: string;
      adx?: number;
      rsi?: number;
      price?: number;
    };
    confidence: {
      overall: number;
      statistical: number;
      market: number;
      execution: number;
    };
  }): TradeReason {
    const { signal, marketState, confidence } = params;

    const reason: TradeReason = {
      coin: signal.coin,
      action: signal.direction === 'bullish' ? 'BUY' : 'SELL',
      timestamp: Date.now(),
      price: marketState.price || 0,
      primaryReason: this.generatePrimaryReason(signal),
      triggeredSignals: this.extractTriggeredSignals(signal),
      marketState: {
        trend: marketState.trend,
        volatility: marketState.volatility,
        adx: marketState.adx,
        rsi: marketState.rsi,
        price: marketState.price,
      },
      confidence,
      risk: {
        stopLossDistance: signal.stopLossDistance,
        takeProfitDistance: signal.takeProfitDistance,
        positionSize: signal.positionSize,
        riskLevel: signal.riskLevel,
      },
    };

    this.reasons.push(reason);

    // 限制记录数量
    if (this.reasons.length > this.maxReasons) {
      this.reasons = this.reasons.slice(-this.maxReasons);
    }

    return reason;
  }

  /**
   * 生成主要理由
   */
  private generatePrimaryReason(signal: AggregatedSignal): string {
    if (signal.signals.length === 0) {
      return '无信号';
    }

    // 找出最强的信号
    const strongest = signal.signals.reduce((a, b) =>
      a.strength > b.strength ? a : b
    );

    const signalName = this.getSignalName(strongest.type);
    const strength = (strongest.strength * 100).toFixed(0);

    return `${signalName}（强度${strength}%）`;
  }

  /**
   * 提取触发的信号
   */
  private extractTriggeredSignals(signal: AggregatedSignal): Array<{
    type: string;
    strength: number;
    description: string;
  }> {
    return signal.signals.map(s => ({
      type: this.getSignalName(s.type),
      strength: s.strength,
      description: this.describeSignal(s),
    }));
  }

  /**
   * 获取信号名称
   */
  private getSignalName(type: string): string {
    const names: Record<string, string> = {
      'MA_7_25_CROSSOVER': 'MA7/25金叉',
      'MA_7_25_CROSSUNDER': 'MA7/25死叉',
      'MA_25_99_CROSSOVER': 'MA25/99金叉',
      'MA_25_99_CROSSUNDER': 'MA25/99死叉',
      'RSI_OVERSOLD': 'RSI超卖',
      'RSI_OVERBOUGHT': 'RSI超买',
      'RSI_NEUTRAL_CROSS_UP': 'RSI向上穿越50',
      'RSI_NEUTRAL_CROSS_DOWN': 'RSI向下穿越50',
      'MACD_BULLISH_CROSS': 'MACD金叉',
      'MACD_BEARISH_CROSS': 'MACD死叉',
      'BB_LOWER_TOUCH': '触及布林带下轨',
      'BB_UPPER_TOUCH': '触及布林带上轨',
      'BB_BREAKOUT_UP': '突破布林带上轨',
      'BB_BREAKOUT_DOWN': '跌破布林带下轨',
      'VOLUME_SPIKE': '成交量异常',
    };

    return names[type] || type;
  }

  /**
   * 描述信号
   */
  private describeSignal(source: any): string {
    const descriptions: Record<string, string> = {
      'MA_7_25_CROSSOVER': '短期均线向上穿越中期均线，可能转强',
      'MA_7_25_CROSSUNDER': '短期均线向下穿越中期均线，可能转弱',
      'MA_25_99_CROSSOVER': '中期均线向上穿越长期均线，趋势反转',
      'MA_25_99_CROSSUNDER': '中期均线向下穿越长期均线，趋势反转',
      'RSI_OVERSOLD': 'RSI低于30，超卖可能反弹',
      'RSI_OVERBOUGHT': 'RSI高于70，超买可能回调',
      'MACD_BULLISH_CROSS': 'MACD快线上穿慢线，动量转强',
      'MACD_BEARISH_CROSS': 'MACD快线下穿慢线，动量转弱',
      'BB_LOWER_TOUCH': '价格触及下轨，可能在支撑位',
      'BB_UPPER_TOUCH': '价格触及上轨，可能在阻力位',
    };

    return descriptions[source.type] || '技术信号';
  }

  /**
   * 获取最近的交易记录
   */
  getRecentReasons(coin: string, limit: number = 10): TradeReason[] {
    return this.reasons
      .filter(r => r.coin === coin)
      .slice(-limit);
  }

  /**
   * 生成交易报告
   */
  generateReport(coin: string): string {
    const recent = this.getRecentReasons(coin, 20);
    if (recent.length === 0) {
      return `\n=== ${coin} 交易历史 ===\n无交易记录\n`;
    }

    let report = `\n=== ${coin} 交易历史 (${recent.length}条) ===\n`;

    recent.forEach((r, i) => {
      report += `\n[${i + 1}] ${r.action} @ ${r.price}\n`;
      report += `  时间: ${new Date(r.timestamp).toLocaleString('zh-CN')}\n`;
      report += `  理由: ${r.primaryReason}\n`;
      report += `  置信度: ${(r.confidence.overall * 100).toFixed(0)}% `;
      report += `(统计${(r.confidence.statistical * 100).toFixed(0)}% `;
      report += `市场${(r.confidence.market * 100).toFixed(0)}% `;
      report += `执行${(r.confidence.execution * 100).toFixed(0)}%)\n`;
      report += `  风险: ${r.risk.riskLevel} `;
      report += `止损${(r.risk.stopLossDistance * 100).toFixed(1)}% `;
      report += `止盈${(r.risk.takeProfitDistance * 100).toFixed(1)}% `;
      report += `仓位${(r.risk.positionSize * 100).toFixed(1)}%\n`;
      report += `  市场: ${r.marketState.trend} ${r.marketState.volatility}`;
      if (r.marketState.adx) report += ` ADX:${r.marketState.adx.toFixed(0)}`;
      if (r.marketState.rsi) report += ` RSI:${r.marketState.rsi.toFixed(0)}`;
      report += `\n`;
    });

    return report;
  }

  /**
   * 统计交易表现
   */
  getStats(coin: string): {
    totalTrades: number;
    buyCount: number;
    sellCount: number;
    avgConfidence: number;
    avgRiskLevel: string;
  } {
    const coinReasons = this.reasons.filter(r => r.coin === coin);

    if (coinReasons.length === 0) {
      return {
        totalTrades: 0,
        buyCount: 0,
        sellCount: 0,
        avgConfidence: 0,
        avgRiskLevel: 'N/A',
      };
    }

    const buyCount = coinReasons.filter(r => r.action === 'BUY').length;
    const sellCount = coinReasons.filter(r => r.action === 'SELL').length;
    const avgConfidence = coinReasons.reduce((sum, r) => sum + r.confidence.overall, 0) / coinReasons.length;

    // 计算平均风险级别
    const riskLevels = coinReasons.map(r => r.risk.riskLevel);
    const riskCounts = {
      low: riskLevels.filter(r => r === 'low').length,
      medium: riskLevels.filter(r => r === 'medium').length,
      high: riskLevels.filter(r => r === 'high').length,
    };
    const avgRiskLevel = riskCounts.high >= riskCounts.medium ? 'high' :
                        riskCounts.medium >= riskCounts.low ? 'medium' : 'low';

    return {
      totalTrades: coinReasons.length,
      buyCount,
      sellCount,
      avgConfidence,
      avgRiskLevel,
    };
  }

  /**
   * 清除旧记录
   */
  clear(coin?: string): void {
    if (coin) {
      this.reasons = this.reasons.filter(r => r.coin !== coin);
    } else {
      this.reasons = [];
    }
  }

  /**
   * 导出记录
   */
  export(coin?: string): TradeReason[] {
    if (coin) {
      return this.reasons.filter(r => r.coin === coin);
    }
    return [...this.reasons];
  }
}
