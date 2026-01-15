/**
 * 趋势分析模块
 *
 * 功能：
 * - 识别市场趋势（上涨、下跌、震荡）
 * - 支持多种技术指标
 * - 动态切换策略模式
 */

// =====================================================
// 趋势类型
// =====================================================

export type TrendDirection = 'uptrend' | 'downtrend' | 'sideways' | 'unknown';

export interface TrendAnalysis {
  direction: TrendDirection;
  strength: number;                 // 趋势强度 0-100
  confidence: number;               // 置信度 0-100
  suggestedMode: 'aggressive' | 'normal' | 'conservative' | 'pause';
  reason: string;
}

// =====================================================
// K线数据
// =====================================================

export interface CandleData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// =====================================================
// 趋势分析器类
// =====================================================

export class TrendAnalyzer {
  private candles: Map<string, CandleData[]> = new Map();
  private maxCandles: number = 100;

  /**
   * 添加K线数据
   */
  addCandles(symbol: string, candles: CandleData[]): void {
    const existing = this.candles.get(symbol) || [];
    const merged = [...existing, ...candles];

    // 按时间排序并去重
    const unique = merged
      .sort((a, b) => a.timestamp - b.timestamp)
      .filter((candle, index, array) => {
        if (index === 0) return true;
        return candle.timestamp !== array[index - 1].timestamp;
      });

    // 保留最近N条
    this.candles.set(symbol, unique.slice(-this.maxCandles));
  }

  /**
   * 分析趋势
   */
  analyzeTrend(symbol: string): TrendAnalysis {
    const candles = this.candles.get(symbol) || [];

    if (candles.length < 20) {
      return {
        direction: 'unknown',
        strength: 0,
        confidence: 0,
        suggestedMode: 'normal',
        reason: '数据不足，至少需要20根K线'
      };
    }

    // 计算各种指标
    const sma20 = this.calculateSMA(candles, 20);
    const sma50 = this.calculateSMA(candles, 50);
    const ema12 = this.calculateEMA(candles, 12);
    const ema26 = this.calculateEMA(candles, 26);
    const macd = ema12 - ema26;

    const currentPrice = candles[candles.length - 1].close;
    const priceChange20 = (currentPrice - sma20) / sma20 * 100;

    // RSI
    const rsi = this.calculateRSI(candles, 14);

    // 布林带
    const bollinger = this.calculateBollingerBands(candles, 20, 2);

    // 趋势判断
    let direction: TrendDirection;
    let strength: number;
    let confidence: number;
    let suggestedMode: 'aggressive' | 'normal' | 'conservative' | 'pause';
    let reason: string;

    // 综合判断
    if (sma20 > sma50 && priceChange20 > 2 && rsi > 50 && rsi < 70) {
      direction = 'uptrend';
      strength = Math.min(100, Math.abs(priceChange20) * 10 + (rsi - 50));
      confidence = 80;
      suggestedMode = 'aggressive';
      reason = `上升趋势: SMA20 > SMA50, 价格 ${priceChange20.toFixed(2)}% 高于均线, RSI ${rsi.toFixed(1)}`;
    } else if (sma20 < sma50 && priceChange20 < -2 && rsi < 50 && rsi > 30) {
      direction = 'downtrend';
      strength = Math.min(100, Math.abs(priceChange20) * 10 + (50 - rsi));
      confidence = 80;
      suggestedMode = 'conservative';
      reason = `下降趋势: SMA20 < SMA50, 价格 ${priceChange20.toFixed(2)}% 低于均线, RSI ${rsi.toFixed(1)}`;
    } else if (Math.abs(priceChange20) < 1 && rsi > 40 && rsi < 60) {
      direction = 'sideways';
      strength = 100 - Math.abs(priceChange20) * 50;
      confidence = 70;
      suggestedMode = 'normal';
      reason = `震荡行情: 价格在均线附近 ${priceChange20.toFixed(2)}%, RSI ${rsi.toFixed(1)} 在中性区域`;
    } else {
      direction = 'unknown';
      strength = 50;
      confidence = 30;
      suggestedMode = 'normal';
      reason = `趋势不明: 价格 ${priceChange20.toFixed(2)}% vs 均线, RSI ${rsi.toFixed(1)}`;
    }

    // 特殊情况处理
    if (rsi > 80) {
      suggestedMode = 'conservative';
      reason += ', RSI超买警告';
    } else if (rsi < 20) {
      suggestedMode = 'conservative';
      reason += ', RSI超卖警告';
    }

    // 布林带突破检查
    if (currentPrice > bollinger.upper) {
      suggestedMode = 'conservative';
      reason += ', 突破布林带上轨';
    } else if (currentPrice < bollinger.lower) {
      suggestedMode = 'conservative';
      reason += ', 跌破布林带下轨';
    }

    return {
      direction,
      strength: Math.round(strength),
      confidence: Math.round(confidence),
      suggestedMode,
      reason
    };
  }

  /**
   * 计算简单移动平均线 (SMA)
   */
  private calculateSMA(candles: CandleData[], period: number): number {
    if (candles.length < period) return 0;

    const sum = candles
      .slice(-period)
      .reduce((acc, candle) => acc + candle.close, 0);

    return sum / period;
  }

  /**
   * 计算指数移动平均线 (EMA)
   */
  private calculateEMA(candles: CandleData[], period: number): number {
    if (candles.length < period) return 0;

    const multiplier = 2 / (period + 1);
    let ema = this.calculateSMA(candles.slice(0, period), period);

    for (let i = period; i < candles.length; i++) {
      ema = (candles[i].close - ema) * multiplier + ema;
    }

    return ema;
  }

  /**
   * 计算相对强弱指数 (RSI)
   */
  private calculateRSI(candles: CandleData[], period: number): number {
    if (candles.length < period + 1) return 50;

    let gains = 0;
    let losses = 0;

    // 计算初始平均
    for (let i = candles.length - period; i < candles.length; i++) {
      const change = candles[i].close - candles[i - 1].close;
      if (change > 0) {
        gains += change;
      } else {
        losses += Math.abs(change);
      }
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;

    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  /**
   * 计算布林带
   */
  private calculateBollingerBands(
    candles: CandleData[],
    period: number,
    stdDev: number
  ): { upper: number; middle: number; lower: number } {
    const middle = this.calculateSMA(candles, period);

    const squaredDiffs = candles
      .slice(-period)
      .map(candle => Math.pow(candle.close - middle, 2));

    const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
    const std = Math.sqrt(variance);

    return {
      upper: middle + stdDev * std,
      middle,
      lower: middle - stdDev * std
    };
  }

  /**
   * 生成趋势报告
   */
  generateTrendReport(symbol: string): string {
    const analysis = this.analyzeTrend(symbol);
    const candles = this.candles.get(symbol) || [];

    let report = `
${symbol} 趋势分析
${'='.repeat(60)}
趋势方向: ${this.getTrendLabel(analysis.direction)}
趋势强度: ${analysis.strength}/100
置信度: ${analysis.confidence}%
建议模式: ${this.getModeLabel(analysis.suggestedMode)}

分析原因: ${analysis.reason}
`;

    if (candles.length > 0) {
      const latest = candles[candles.length - 1];
      report += `
最新价格: ${latest.close.toFixed(2)}
涨跌幅: ${((latest.close - latest.open) / latest.open * 100).toFixed(2)}%
成交量: ${latest.volume.toFixed(0)}
`;
    }

    return report;
  }

  /**
   * 获取趋势标签
   */
  private getTrendLabel(direction: TrendDirection): string {
    const labels = {
      uptrend: '上涨趋势 ↗',
      downtrend: '下降趋势 ↘',
      sideways: '横盘震荡 ↔',
      unknown: '趋势不明 ?'
    };
    return labels[direction];
  }

  /**
   * 获取模式标签
   */
  private getModeLabel(mode: 'aggressive' | 'normal' | 'conservative' | 'pause'): string {
    const labels = {
      aggressive: '激进模式',
      normal: '正常模式',
      conservative: '保守模式',
      pause: '暂停交易'
    };
    return labels[mode];
  }

  /**
   * 获取建议操作
   */
  getSuggestedAction(analysis: TrendAnalysis): string {
    switch (analysis.suggestedMode) {
      case 'aggressive':
        return '趋势明确向上，可适当增加仓位，追涨但注意风险';
      case 'normal':
        return '市场平稳，按正常策略执行';
      case 'conservative':
        return '趋势不明或风险较高，减少仓位，严格止损';
      case 'pause':
        return '市场风险过高，建议暂停交易';
      default:
        return '保持当前策略';
    }
  }
}
