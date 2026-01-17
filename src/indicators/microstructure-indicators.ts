/**
 * 高频交易专用指标
 *
 * 针对秒级/分钟级短时交易设计
 * 基于市场微观结构，而非传统的技术分析
 */

import { logger } from '../utils/logger;
import type { KLineInterval } from '../market/types;

// =====================================================
// 微观结构指标
// =====================================================

export interface MicrostructureIndicators {
  /** 订单流不平衡 (-1到1，正数表示买方强) */
  orderFlowImbalance: number;

  /** 1分钟价格动能 (%) */
  priceMomentum1m: number;

  /** 5分钟价格动能 (%) */
  priceMomentum5m: number;

  /** 实现波动率（1分钟窗口） */
  realizedVolatility: number;

  /** 成交量突增倍数 */
  volumeSpike: number;

  /** 买卖价差（占价格比例） */
  bidAskSpread: number;

  /** 盘口深度不平衡 (-1到1) */
  depthImbalance: number;

  /** 价格偏离VWAP的程度 (%) */
  vwapDeviation: number;

  /** 短期OBV变化 (1分钟) */
  shortTermOBV: number;

  /** 价格动量方向 */
  momentumDirection: 'up' | 'down' | 'neutral';

  /** 成交量趋势 */
  volumeTrend: 'increasing' | 'decreasing' | 'stable';

  /** 综合信号强度 (0-100) */
  compositeStrength: number;
}

// =====================================================
// 订单簿快照
// =====================================================

export interface OrderBookSnapshot {
  /** 买盘 [价格, 数量][] */
  bids: [number, number][];

  /** 卖盘 [价格, 数量][] */
  asks: [number, number][];

  /** 最佳买价 */
  bestBid: number;

  /** 最佳卖价 */
  bestAsk: number;

  /** 中间价 */
  midPrice: number;

  /** 时间戳 */
  timestamp: number;
}

// =====================================================
// 事件驱动信号
// =====================================================

export interface PriceBreakoutEvent {
  /** 是否为突破 */
  isBreakout: boolean;

  /** 突破的价格水平 */
  level: number;

  /** 突破强度 (0-100) */
  strength: number;

  /** 假突破概率 (0-1) */
  fakeBreakoutProb: number;

  /** 突破方向 */
  direction: 'up' | 'down';
}

export interface VolumeSurgeEvent {
  /** 是否为成交量激增 */
  isSurge: boolean;

  /** 成交量倍数 (相对于平均值) */
  ratio: number;

  /** 价格影响 (%) */
  priceImpact: number;

  /** 信号质量 (0-100) */
  quality: number;
}

export interface MomentumReversalEvent {
  /** 是否发生动能转换 */
  isReversal: boolean;

  /** 原方向 */
  from: 'bullish' | 'bearish';

  /** 新方向 */
  to: 'bullish' | 'bearish';

  /** 置信度 (0-1) */
  confidence: number;

  /** 转换强度 (0-100) */
  strength: number;
}

// =====================================================
// 实时风险指标
// =====================================================

export interface RealTimeRiskMetrics {
  /** 市场风险 */
  marketRisk: {
    /** 波动率水平 */
    volatility: 'low' | 'normal' | 'high' | 'extreme';

    /** 流动性状态 */
    liquidity: 'sufficient' | 'tight' | 'dry';

    /** 价差状态 */
    spread: 'normal' | 'wide' | 'extreme';
  };

  /** 交易风险 */
  tradeRisk: {
    /** 预期滑点 (%) */
    expectedSlippage: number;

    /** 成交概率 (0-1) */
    fillProbability: number;

    /** 逆向选择风险 (0-1) */
    adverseSelectionRisk: number;
  };

  /** 系统风险 */
  systemRisk: {
    /** API延迟 (ms) */
    apiLatency: number;

    /** WebSocket连接状态 */
    websocketConnected: boolean;

    /** 订单队列长度 */
    orderQueueSize: number;
  };

  /** 综合风险等级 */
  overallRisk: 'low' | 'medium' | 'high' | 'extreme';
}

// =====================================================
// 高频指标计算器
// =====================================================

export class HighFrequencyIndicatorCalculator {
  // 价格历史（用于计算短期动能）
  private priceHistory: Map<string, number[]> = new Map();

  // 成交量历史
  private volumeHistory: Map<string, number[]> = new Map();

  // OBV历史
  private obvHistory: Map<string, number[]> = new Map();

  // 最大历史长度
  private readonly MAX_HISTORY = 100;

  /**
   * 计算微观结构指标
   */
  calculateMicrostructureIndicators(
    coin: string,
    currentPrice: number,
    volume: number,
    orderBook: OrderBookSnapshot,
    timeframe: KLineInterval
  ): MicrostructureIndicators {
    // 更新历史数据
    this.updateHistory(coin, currentPrice, volume);

    // 1. 订单流不平衡
    const orderFlowImbalance = this.calculateOrderFlowImbalance(orderBook);

    // 2. 价格动能
    const priceMomentum1m = this.calculatePriceMomentum(coin, 1);
    const priceMomentum5m = this.calculatePriceMomentum(coin, 5);

    // 3. 实现波动率
    const realizedVolatility = this.calculateRealizedVolatility(coin);

    // 4. 成交量突增
    const volumeSpike = this.calculateVolumeSpike(coin, volume);

    // 5. 买卖价差
    const bidAskSpread = (orderBook.bestAsk - orderBook.bestBid) / orderBook.midPrice;

    // 6. 深度不平衡
    const depthImbalance = this.calculateDepthImbalance(orderBook);

    // 7. VWAP偏离
    const vwapDeviation = this.calculateVWAPDeviation(coin, currentPrice);

    // 8. 短期OBV
    const shortTermOBV = this.calculateShortTermOBV(coin);

    // 9. 动能方向
    const momentumDirection = this.getMomentumDirection(priceMomentum1m, priceMomentum5m);

    // 10. 成交量趋势
    const volumeTrend = this.getVolumeTrend(coin);

    // 11. 综合信号强度
    const compositeStrength = this.calculateCompositeStrength({
      orderFlowImbalance,
      priceMomentum1m,
      priceMomentum5m,
      volumeSpike,
      depthImbalance
    });

    return {
      orderFlowImbalance,
      priceMomentum1m,
      priceMomentum5m,
      realizedVolatility,
      volumeSpike,
      bidAskSpread,
      depthImbalance,
      vwapDeviation,
      shortTermOBV,
      momentumDirection,
      volumeTrend,
      compositeStrength
    };
  }

  /**
   * 计算订单流不平衡
   */
  private calculateOrderFlowImbalance(orderBook: OrderBookSnapshot): number {
    // 计算前3档的买卖量
    const bidVolume = orderBook.bids.slice(0, 3).reduce((sum, [, qty]) => sum + qty, 0);
    const askVolume = orderBook.asks.slice(0, 3).reduce((sum, [, qty]) => sum + qty, 0);

    // 不平衡度：-1到1
    if (bidVolume + askVolume === 0) return 0;
    return (bidVolume - askVolume) / (bidVolume + askVolume);
  }

  /**
   * 计算价格动能
   */
  private calculatePriceMomentum(coin: string, periods: number): number {
    const history = this.priceHistory.get(coin);
    if (!history || history.length < periods + 1) return 0;

    const current = history[history.length - 1];
    const past = history[history.length - 1 - periods];

    return ((current - past) / past) * 100;
  }

  /**
   * 计算实现波动率（1分钟窗口）
   */
  private calculateRealizedVolatility(coin: string): number {
    const history = this.priceHistory.get(coin);
    if (!history || history.length < 20) return 0;

    // 计算最近20个价格点的收益率标准差
    const returns = [];
    for (let i = 1; i < Math.min(21, history.length); i++) {
      const ret = (history[history.length - i] - history[history.length - i - 1]) / history[history.length - i - 1];
      returns.push(ret);
    }

    const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
    const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / returns.length;

    return Math.sqrt(variance) * 100; // 转换为百分比
  }

  /**
   * 计算成交量突增
   */
  private calculateVolumeSpike(coin: string, currentVolume: number): number {
    const history = this.volumeHistory.get(coin);
    if (!history || history.length < 20) return 1;

    // 计算平均成交量（最近20个）
    const avgVolume = history.slice(-20).reduce((sum, v) => sum + v, 0) / Math.min(20, history.length);

    if (avgVolume === 0) return 1;
    return currentVolume / avgVolume;
  }

  /**
   * 计算深度不平衡
   */
  private calculateDepthImbalance(orderBook: OrderBookSnapshot): number {
    // 计算前10档的买卖量
    const bidVolume = orderBook.bids.slice(0, 10).reduce((sum, [, qty]) => sum + qty, 0);
    const askVolume = orderBook.asks.slice(0, 10).reduce((sum, [, qty]) => sum + qty, 0);

    if (bidVolume + askVolume === 0) return 0;
    return (bidVolume - askVolume) / (bidVolume + askVolume);
  }

  /**
   * 计算VWAP偏离
   */
  private calculateVWAPDeviation(coin: string, currentPrice: number): number {
    const priceHistory = this.priceHistory.get(coin);
    const volumeHistory = this.volumeHistory.get(coin);

    if (!priceHistory || !volumeHistory || priceHistory.length < 20) return 0;

    // 计算最近20个时间点的VWAP
    let totalValue = 0;
    let totalVolume = 0;

    const count = Math.min(20, priceHistory.length);
    for (let i = 0; i < count; i++) {
      const idx = priceHistory.length - 1 - i;
      totalValue += priceHistory[idx] * volumeHistory[idx];
      totalVolume += volumeHistory[idx];
    }

    const vwap = totalValue / totalVolume;
    return ((currentPrice - vwap) / vwap) * 100;
  }

  /**
   * 计算短期OBV变化
   */
  private calculateShortTermOBV(coin: string): number {
    const history = this.obvHistory.get(coin);
    if (!history || history.length < 2) return 0;

    // 最近1分钟的OBV变化
    const current = history[history.length - 1];
    const past = history[Math.max(0, history.length - 2)];

    return current - past;
  }

  /**
   * 获取动能方向
   */
  private getMomentumDirection(momentum1m: number, momentum5m: number): 'up' | 'down' | 'neutral' {
    if (momentum1m > 0.05 && momentum5m > 0.1) return 'up';
    if (momentum1m < -0.05 && momentum5m < -0.1) return 'down';
    return 'neutral';
  }

  /**
   * 获取成交量趋势
   */
  private getVolumeTrend(coin: string): 'increasing' | 'decreasing' | 'stable' {
    const history = this.volumeHistory.get(coin);
    if (!history || history.length < 10) return 'stable';

    const recent5 = history.slice(-5).reduce((sum, v) => sum + v, 0) / 5;
    const previous5 = history.slice(-10, -5).reduce((sum, v) => sum + v, 0) / 5;

    const change = (recent5 - previous5) / previous5;

    if (change > 0.2) return 'increasing';
    if (change < -0.2) return 'decreasing';
    return 'stable';
  }

  /**
   * 计算综合信号强度
   */
  private calculateCompositeStrength(indicators: {
    orderFlowImbalance: number;
    priceMomentum1m: number;
    priceMomentum5m: number;
    volumeSpike: number;
    depthImbalance: number;
  }): number {
    // 各指标权重
    const weights = {
      orderFlow: 0.3,
      momentum1m: 0.2,
      momentum5m: 0.2,
      volume: 0.15,
      depth: 0.15
    };

    // 归一化各指标到0-100
    const normalizedOrderFlow = (indicators.orderFlowImbalance + 1) * 50; // -1到1 -> 0到100
    const normalizedMomentum1m = Math.min(100, Math.max(0, (indicators.priceMomentum1m + 1) * 50));
    const normalizedMomentum5m = Math.min(100, Math.max(0, (indicators.priceMomentum5m + 1) * 50));
    const normalizedVolume = Math.min(100, indicators.volumeSpike * 20); // 5倍 = 100分
    const normalizedDepth = (indicators.depthImbalance + 1) * 50;

    // 加权平均
    const strength =
      normalizedOrderFlow * weights.orderFlow +
      normalizedMomentum1m * weights.momentum1m +
      normalizedMomentum5m * weights.momentum5m +
      normalizedVolume * weights.volume +
      normalizedDepth * weights.depth;

    return Math.min(100, Math.max(0, strength));
  }

  /**
   * 更新历史数据
   */
  private updateHistory(coin: string, price: number, volume: number): void {
    // 更新价格历史
    const prices = this.priceHistory.get(coin) || [];
    prices.push(price);
    if (prices.length > this.MAX_HISTORY) {
      prices.shift();
    }
    this.priceHistory.set(coin, prices);

    // 更新成交量历史
    const volumes = this.volumeHistory.get(coin) || [];
    volumes.push(volume);
    if (volumes.length > this.MAX_HISTORY) {
      volumes.shift();
    }
    this.volumeHistory.set(coin, volumes);

    // 更新OBV历史
    const obvs = this.obvHistory.get(coin) || [];
    const lastOBV = obvs.length > 0 ? obvs[obvs.length - 1] : 0;
    const prevPrice = prices.length > 1 ? prices[prices.length - 2] : price;

    let obvChange = 0;
    if (price > prevPrice) {
      obvChange = volume;
    } else if (price < prevPrice) {
      obvChange = -volume;
    }

    obvs.push(lastOBV + obvChange);
    if (obvs.length > this.MAX_HISTORY) {
      obvs.shift();
    }
    this.obvHistory.set(coin, obvs);
  }

  // =====================================================
  // 事件检测
  // =====================================================

  /**
   * 检测价格突破
   */
  detectPriceBreakout(
    coin: string,
    currentPrice: number,
    orderBook: OrderBookSnapshot
  ): PriceBreakoutEvent {
    const history = this.priceHistory.get(coin);
    if (!history || history.length < 20) {
      return {
        isBreakout: false,
        level: currentPrice,
        strength: 0,
        fakeBreakoutProb: 0,
        direction: 'up'
      };
    }

    // 找出最近20个时间点的最高价和最低价
    const recent20 = history.slice(-20);
    const high20 = Math.max(...recent20);
    const low20 = Math.min(...recent20);

    // 检查是否突破
    const isUpBreakout = currentPrice > high20 * 1.001; // 突破0.1%
    const isDownBreakout = currentPrice < low20 * 0.999;

    if (!isUpBreakout && !isDownBreakout) {
      return {
        isBreakout: false,
        level: currentPrice,
        strength: 0,
        fakeBreakoutProb: 0,
        direction: 'up'
      };
    }

    const direction = isUpBreakout ? 'up' : 'down';

    // 计算突破强度（基于成交量）
    const volumeSpike = this.calculateVolumeSpike(coin, orderBook.bids[0]?.[1] || 0);
    const strength = Math.min(100, volumeSpike * 20);

    // 计算假突破概率（基于深度不平衡）
    const depthImbalance = this.calculateDepthImbalance(orderBook);
    const fakeBreakoutProb = Math.max(0, 1 - Math.abs(depthImbalance));

    return {
      isBreakout: true,
      level: isUpBreakout ? high20 : low20,
      strength,
      fakeBreakoutProb,
      direction
    };
  }

  /**
   * 检测成交量激增
   */
  detectVolumeSurge(coin: string, currentVolume: number): VolumeSurgeEvent {
    const volumeSpike = this.calculateVolumeSpike(coin, currentVolume);

    const isSurge = volumeSpike > 2; // 成交量翻倍

    // 计算价格影响
    const history = this.priceHistory.get(coin);
    let priceImpact = 0;
    if (history && history.length >= 2) {
      priceImpact = ((history[history.length - 1] - history[history.length - 2]) / history[history.length - 2]) * 100;
    }

    // 信号质量（成交量越大且价格影响越小，质量越高）
    const quality = Math.min(100, (volumeSpike / Math.abs(priceImpact || 1)) * 10);

    return {
      isSurge,
      ratio: volumeSpike,
      priceImpact,
      quality
    };
  }

  /**
   * 检测动能转换
   */
  detectMomentumReversal(coin: string): MomentumReversalEvent {
    const history = this.priceHistory.get(coin);
    if (!history || history.length < 10) {
      return {
        isReversal: false,
        from: 'bullish',
        to: 'bearish',
        confidence: 0,
        strength: 0
      };
    }

    // 计算短期和长期动能
    const momentumShort = this.calculatePriceMomentum(coin, 3);
    const momentumLong = this.calculatePriceMomentum(coin, 10);

    // 检测转换
    let from: 'bullish' | 'bearish' = 'bullish';
    let to: 'bullish' | 'bearish' = 'bullish';
    let confidence = 0;
    let strength = 0;

    if (momentumLong > 0.1 && momentumShort < -0.1) {
      // 从看涨转为看跌
      from = 'bullish';
      to = 'bearish';
      confidence = Math.min(1, Math.abs(momentumShort) / 0.5);
      strength = Math.min(100, Math.abs(momentumShort) * 100);
    } else if (momentumLong < -0.1 && momentumShort > 0.1) {
      // 从看跌转为看涨
      from = 'bearish';
      to = 'bullish';
      confidence = Math.min(1, Math.abs(momentumShort) / 0.5);
      strength = Math.min(100, Math.abs(momentumShort) * 100);
    }

    const isReversal = confidence > 0.5;

    return {
      isReversal,
      from,
      to,
      confidence,
      strength
    };
  }

  // =====================================================
  // 实时风险评估
  // =====================================================

  /**
   * 计算实时风险指标
   */
  calculateRealTimeRiskMetrics(
    coin: string,
    orderBook: OrderBookSnapshot,
    apiLatency: number,
    websocketConnected: boolean,
    orderQueueSize: number
  ): RealTimeRiskMetrics {
    // 1. 市场风险
    const volatility = this.calculateRealizedVolatility(coin);
    const marketRisk = {
      volatility: volatility < 0.5 ? 'low' : volatility < 1.5 ? 'normal' : volatility < 3 ? 'high' : 'extreme' as any,
      liquidity: this.assessLiquidity(orderBook),
      spread: this.assessSpread(orderBook)
    };

    // 2. 交易风险
    const expectedSlippage = this.estimateSlippage(orderBook);
    const fillProbability = this.estimateFillProbability(orderBook);
    const adverseSelectionRisk = this.assessAdverseSelectionRisk(coin);

    const tradeRisk = {
      expectedSlippage,
      fillProbability,
      adverseSelectionRisk
    };

    // 3. 系统风险
    const systemRisk = {
      apiLatency,
      websocketConnected,
      orderQueueSize
    };

    // 4. 综合风险等级
    const overallRisk = this.calculateOverallRisk({
      marketRisk,
      tradeRisk,
      systemRisk
    });

    return {
      marketRisk,
      tradeRisk,
      systemRisk,
      overallRisk
    };
  }

  /**
   * 评估流动性
   */
  private assessLiquidity(orderBook: OrderBookSnapshot): 'sufficient' | 'tight' | 'dry' {
    // 检查前5档深度
    const bidDepth = orderBook.bids.slice(0, 5).reduce((sum, [, qty]) => sum + qty, 0);
    const askDepth = orderBook.asks.slice(0, 5).reduce((sum, [, qty]) => sum + qty, 0);

    const totalDepth = bidDepth + askDepth;

    // 根据深度判断流动性（这里假设阈值，实际应该根据币种调整）
    if (totalDepth > 100000) return 'sufficient';
    if (totalDepth > 50000) return 'tight';
    return 'dry';
  }

  /**
   * 评估价差
   */
  private assessSpread(orderBook: OrderBookSnapshot): 'normal' | 'wide' | 'extreme' {
    const spread = (orderBook.bestAsk - orderBook.bestBid) / orderBook.midPrice;

    if (spread < 0.001) return 'normal'; // 0.1%以下
    if (spread < 0.005) return 'wide';   // 0.5%以下
    return 'extreme';                    // 0.5%以上
  }

  /**
   * 估算滑点
   */
  private estimateSlippage(orderBook: OrderBookSnapshot, orderSize: number = 1000): number {
    // 简化估算：假设订单大小为1000
    const spread = (orderBook.bestAsk - orderBook.bestBid) / orderBook.midPrice;
    const slippage = spread / 2;

    return slippage * 100; // 转换为百分比
  }

  /**
   * 估算成交概率
   */
  private estimateFillProbability(orderBook: OrderBookSnapshot): number {
    // 基于深度估算
    const depth = orderBook.bids[0]?.[1] || 0;

    // 深度越大，成交概率越高
    return Math.min(1, depth / 10000); // 假设10000深度为满值
  }

  /**
   * 评估逆向选择风险
   */
  private assessAdverseSelectionRisk(coin: string): number {
    // 基于价格波动率评估
    const volatility = this.calculateRealizedVolatility(coin);

    // 波动率越高，逆向选择风险越大
    return Math.min(1, volatility / 5);
  }

  /**
   * 计算综合风险等级
   */
  private calculateOverallRisk(risks: {
    marketRisk: RealTimeRiskMetrics['marketRisk'];
    tradeRisk: RealTimeRiskMetrics['tradeRisk'];
    systemRisk: RealTimeRiskMetrics['systemRisk'];
  }): 'low' | 'medium' | 'high' | 'extreme' {
    let score = 0;

    // 市场风险评分
    if (risks.marketRisk.volatility === 'high') score += 2;
    if (risks.marketRisk.volatility === 'extreme') score += 4;
    if (risks.marketRisk.liquidity === 'tight') score += 2;
    if (risks.marketRisk.liquidity === 'dry') score += 4;
    if (risks.marketRisk.spread === 'wide') score += 2;
    if (risks.marketRisk.spread === 'extreme') score += 4;

    // 交易风险评分
    if (risks.tradeRisk.expectedSlippage > 0.1) score += 2;
    if (risks.tradeRisk.expectedSlippage > 0.3) score += 4;
    if (risks.tradeRisk.fillProbability < 0.8) score += 2;
    if (risks.tradeRisk.fillProbability < 0.5) score += 4;

    // 系统风险评分
    if (risks.systemRisk.apiLatency > 200) score += 2;
    if (risks.systemRisk.apiLatency > 500) score += 4;
    if (!risks.systemRisk.websocketConnected) score += 4;
    if (risks.systemRisk.orderQueueSize > 10) score += 2;
    if (risks.systemRisk.orderQueueSize > 20) score += 4;

    // 根据评分确定风险等级
    if (score >= 10) return 'extreme';
    if (score >= 6) return 'high';
    if (score >= 3) return 'medium';
    return 'low';
  }

  /**
   * 清理历史数据
   */
  clearHistory(coin?: string): void {
    if (coin) {
      this.priceHistory.delete(coin);
      this.volumeHistory.delete(coin);
      this.obvHistory.delete(coin);
    } else {
      this.priceHistory.clear();
      this.volumeHistory.clear();
      this.obvHistory.clear();
    }

    logger.debug('清理指标历史', { coin });
  }
}

// =====================================================
// 导出单例
// =====================================================

let globalCalculator: HighFrequencyIndicatorCalculator | null = null;

export function getGlobalHFCalculator(): HighFrequencyIndicatorCalculator {
  if (!globalCalculator) {
    globalCalculator = new HighFrequencyIndicatorCalculator();
  }
  return globalCalculator;
}
