/**
 * 动态自适应策略系统
 *
 * 核心理念:
 * - 根据市场状况动态调整杠杆
 * - 根据波动率调整仓位
 * - 根据趋势调整策略方向
 * - 不是一层不变，而是智能适应
 */

export interface MarketCondition {
  // 波动率水平
  volatility: 'low' | 'medium' | 'high' | 'extreme';

  // 趋势方向
  trend: 'uptrend' | 'downtrend' | 'sideways' | 'volatile';

  // 流动性
  liquidity: 'good' | 'moderate' | 'poor';

  // 风险评分 0-100
  riskScore: number;

  // 建议杠杆
  recommendedLeverage: number;

  // 建议仓位
  recommendedPositionPercent: number;

  // 建议模式
  recommendedMode: 'aggressive' | 'normal' | 'conservative' | 'pause';
}

/**
 * 动态杠杆配置
 *
 * 根据市场状况自动调整
 */
export const DYNAMIC_LEVERAGE_CONFIG = {
  BTC: {
    // 低波动 + 明确趋势
    low_volatility_uptrend: {
      leverage: 3,
      position: 30,        // 单边30%
      grids: 12,
      mode: 'aggressive'
    },

    // 低波动 + 震荡
    low_volatility_sideways: {
      leverage: 2,
      position: 40,        // 可以加大仓位（双向）
      grids: 16,
      mode: 'normal'
    },

    // 中等波动
    medium_volatility: {
      leverage: 2,
      position: 25,
      grids: 10,
      mode: 'normal'
    },

    // 高波动
    high_volatility: {
      leverage: 1.5,       // 降到1.5x
      position: 15,
      grids: 6,
      mode: 'conservative'
    },

    // 极端波动（熔断）
    extreme_volatility: {
      leverage: 1,
      position: 5,         // 极小仓位观察
      grids: 4,
      mode: 'pause'        // 暂停新开仓
    }
  },

  ETH: {
    // ETH波动通常比BTC大，所以杠杆更保守
    low_volatility_uptrend: {
      leverage: 2,
      position: 25,
      grids: 12,
      mode: 'normal'
    },

    low_volatility_sideways: {
      leverage: 2,
      position: 35,
      grids: 16,
      mode: 'normal'
    },

    medium_volatility: {
      leverage: 1.5,
      position: 20,
      grids: 10,
      mode: 'conservative'
    },

    high_volatility: {
      leverage: 1,
      position: 10,
      grids: 6,
      mode: 'conservative'
    },

    extreme_volatility: {
      leverage: 1,
      position: 0,         // 完全不开仓
      grids: 0,
      mode: 'pause'
    }
  }
};

/**
 * 市场状况分析器
 */
export class MarketConditionAnalyzer {
  /**
   * 分析当前市场状况
   */
  analyzeMarket(candles: any[], currentPrice: number, volume: number): MarketCondition {
    // 1. 计算波动率 (ATR)
    const volatility = this.calculateVolatility(candles);

    // 2. 判断趋势
    const trend = this.detectTrend(candles);

    // 3. 评估流动性
    const liquidity = this.assessLiquidity(volume, candles);

    // 4. 计算风险评分
    const riskScore = this.calculateRiskScore(volatility, trend, liquidity);

    // 5. 生成建议
    const recommendation = this.generateRecommendation(volatility, trend, riskScore);

    return {
      volatility,
      trend,
      liquidity,
      riskScore,
      ...recommendation
    };
  }

  /**
   * 计算波动率
   */
  private calculateVolatility(candles: any[]): 'low' | 'medium' | 'high' | 'extreme' {
    if (candles.length < 20) return 'medium';

    // 计算ATR (Average True Range)
    const atr = this.calculateATR(candles, 14);
    const currentPrice = candles[candles.length - 1].close;
    const atrPercent = (atr / currentPrice) * 100;

    // 计算最近波动的标准差
    const returns = [];
    for (let i = 1; i < Math.min(21, candles.length); i++) {
      const ret = (candles[candles.length - i].close - candles[candles.length - i - 1].close) /
                  candles[candles.length - i - 1].close;
      returns.push(ret);
    }
    const stdDev = this.calculateStdDev(returns);

    // 综合判断
    if (atrPercent > 15 || stdDev > 0.15) return 'extreme';
    if (atrPercent > 8 || stdDev > 0.08) return 'high';
    if (atrPercent > 4 || stdDev > 0.04) return 'medium';
    return 'low';
  }

  /**
   * 计算ATR
   */
  private calculateATR(candles: any[], period: number): number {
    const trueRanges = [];

    for (let i = 1; i < candles.length && i <= period; i++) {
      const candle = candles[candles.length - i];
      const prevCandle = candles[candles.length - i - 1];

      const tr = Math.max(
        candle.high - candle.low,
        Math.abs(candle.high - prevCandle.close),
        Math.abs(candle.low - prevCandle.close)
      );
      trueRanges.push(tr);
    }

    return trueRanges.reduce((a, b) => a + b, 0) / trueRanges.length;
  }

  /**
   * 计算标准差
   */
  private calculateStdDev(values: number[]): number {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
  }

  /**
   * 检测趋势
   */
  private detectTrend(candles: any[]): 'uptrend' | 'downtrend' | 'sideways' | 'volatile' {
    if (candles.length < 20) return 'sideways';

    const sma20 = this.calculateSMA(candles, 20);
    const sma50 = this.calculateSMA(candles, 50);
    const currentPrice = candles[candles.length - 1].close;

    const priceVsSMA20 = (currentPrice - sma20) / sma20 * 100;
    const smaDiff = (sma20 - sma50) / sma50 * 100;

    // RSI
    const rsi = this.calculateRSI(candles, 14);

    // 判断
    if (Math.abs(priceVsSMA20) > 10 || rsi > 80 || rsi < 20) {
      return 'volatile'; // 极端行情
    }

    if (sma20 > sma50 && priceVsSMA20 > 2 && rsi > 50) {
      return 'uptrend';
    }

    if (sma20 < sma50 && priceVsSMA20 < -2 && rsi < 50) {
      return 'downtrend';
    }

    if (Math.abs(priceVsSMA20) < 2) {
      return 'sideways';
    }

    return 'sideways';
  }

  private calculateSMA(candles: any[], period: number): number {
    if (candles.length < period) return candles[candles.length - 1].close;
    const sum = candles.slice(-period).reduce((a, b) => a + b.close, 0);
    return sum / period;
  }

  private calculateRSI(candles: any[], period: number): number {
    if (candles.length < period + 1) return 50;

    let gains = 0, losses = 0;
    for (let i = candles.length - period; i < candles.length; i++) {
      const change = candles[i].close - candles[i - 1].close;
      if (change > 0) gains += change;
      else losses += Math.abs(change);
    }

    const avgGain = gains / period;
    const avgLoss = losses / period;

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  /**
   * 评估流动性
   */
  private assessLiquidity(currentVolume: number, candles: any[]): 'good' | 'moderate' | 'poor' {
    // 计算平均成交量
    const avgVolumes = candles.slice(-20).map(c => c.volume);
    const avgVolume = avgVolumes.reduce((a, b) => a + b, 0) / avgVolumes.length;

    const volumeRatio = currentVolume / avgVolume;

    if (volumeRatio < 0.3) return 'poor';
    if (volumeRatio < 0.7) return 'moderate';
    return 'good';
  }

  /**
   * 计算风险评分
   */
  private calculateRiskScore(
    volatility: string,
    trend: string,
    liquidity: string
  ): number {
    let score = 50; // 基础分

    // 波动率影响
    const volatilityImpact = {
      'low': -20,
      'medium': 0,
      'high': 25,
      'extreme': 50
    };
    score += volatilityImpact[volatility];

    // 趋势影响
    const trendImpact = {
      'uptrend': -5,
      'sideways': 0,
      'downtrend': 15,
      'volatile': 30
    };
    score += trendImpact[trend];

    // 流动性影响
    const liquidityImpact = {
      'good': -5,
      'moderate': 5,
      'poor': 20
    };
    score += liquidityImpact[liquidity];

    return Math.max(0, Math.min(100, score));
  }

  /**
   * 生成建议
   */
  private generateRecommendation(
    volatility: string,
    trend: string,
    riskScore: number
  ): any {
    let recommendedLeverage = 1;
    let recommendedPositionPercent = 10;
    let recommendedMode: 'aggressive' | 'normal' | 'conservative' | 'pause' = 'normal';

    // 根据风险评分调整
    if (riskScore > 70) {
      recommendedMode = 'pause';
      recommendedLeverage = 1;
      recommendedPositionPercent = 5;
    } else if (riskScore > 50) {
      recommendedMode = 'conservative';
      recommendedLeverage = 1.5;
      recommendedPositionPercent = 15;
    } else if (riskScore < 30 && volatility === 'low') {
      recommendedMode = 'aggressive';
      recommendedLeverage = 3;
      recommendedPositionPercent = 30;
    } else {
      recommendedMode = 'normal';
      recommendedLeverage = 2;
      recommendedPositionPercent = 25;
    }

    return {
      recommendedLeverage,
      recommendedPositionPercent,
      recommendedMode
    };
  }
}

/**
 * 动态策略执行器
 */
export class AdaptiveStrategyExecutor {
  private analyzer: MarketConditionAnalyzer;
  private currentCondition: MarketCondition | null = null;
  private lastUpdate: number = 0;

  constructor() {
    this.analyzer = new MarketConditionAnalyzer();
  }

  /**
   * 更新市场状况并调整策略
   */
  async updateAndAdjust(coin: 'BTC' | 'ETH', candles: any[], currentPrice: number, volume: number) {
    const now = Date.now();

    // 每5分钟更新一次
    if (now - this.lastUpdate < 5 * 60 * 1000) {
      return this.currentCondition;
    }

    // 分析市场
    this.currentCondition = this.analyzer.analyzeMarket(candles, currentPrice, volume);
    this.lastUpdate = now;

    console.log(`\n[${coin}] 市场状况更新:`);
    console.log(`  波动率: ${this.currentCondition.volatility}`);
    console.log(`  趋势: ${this.currentCondition.trend}`);
    console.log(`  流动性: ${this.currentCondition.liquidity}`);
    console.log(`  风险评分: ${this.currentCondition.riskScore}/100`);
    console.log(`  建议杠杆: ${this.currentCondition.recommendedLeverage}x`);
    console.log(`  建议仓位: ${this.currentCondition.recommendedPositionPercent}%`);
    console.log(`  建议模式: ${this.currentCondition.recommendedMode}`);

    return this.currentCondition;
  }

  /**
   * 获取当前配置
   */
  getCurrentConfig(coin: 'BTC' | 'ETH'): any {
    if (!this.currentCondition) {
      // 默认配置
      return {
        leverage: 2,
        position: 20,
        grids: 10,
        mode: 'normal'
      };
    }

    const config = DYNAMIC_LEVERAGE_CONFIG[coin];
    const condition = this.currentCondition;

    // 根据市场状况返回对应配置
    if (condition.volatility === 'extreme') {
      return {
        leverage: config.extreme_volatility.leverage,
        position: config.extreme_volatility.position,
        grids: config.extreme_volatility.grids,
        mode: condition.recommendedMode
      };
    }

    if (condition.volatility === 'high') {
      return config.high_volatility;
    }

    if (condition.volatility === 'medium') {
      return config.medium_volatility;
    }

    // 低波动，根据趋势决定
    if (condition.trend === 'uptrend') {
      return config.low_volatility_uptrend;
    }

    return config.low_volatility_sideways;
  }

  /**
   * 是否应该暂停交易
   */
  shouldPause(): boolean {
    return this.currentCondition?.recommendedMode === 'pause' ||
           this.currentCondition?.riskScore > 70;
  }

  /**
   * 是否需要降杠杆
   */
  shouldReduceLeverage(currentLeverage: number): boolean {
    if (!this.currentCondition) return false;

    const recommended = this.currentCondition.recommendedLeverage;
    return currentLeverage > recommended;
  }

  /**
   * 生成调整报告
   */
  generateAdjustmentReport(coin: string, currentLeverage: number): string {
    if (!this.currentCondition) {
      return '等待市场数据...';
    }

    const recommended = this.currentCondition.recommendedLeverage;

    let report = `
${coin} 策略调整建议
${'='.repeat(60)}
当前市场状况:
  波动率: ${this.currentCondition.volatility}
  趋势: ${this.currentCondition.trend}
  流动性: ${this.currentCondition.liquidity}
  风险评分: ${this.currentCondition.riskScore}/100

建议配置:
  杠杆: ${recommended}x ${currentLeverage > recommended ? '(需降低)' : currentLeverage < recommended ? '(可提高)' : '(保持)'}
  仓位: ${this.currentCondition.recommendedPositionPercent}%
  模式: ${this.currentCondition.recommendedMode}
`;

    if (this.shouldPause()) {
      report += `\n⚠️  建议: 暂停新开仓，市场风险过高`;
    } else if (this.shouldReduceLeverage(currentLeverage)) {
      report += `\n⚠️  建议: 降低杠杆从 ${currentLeverage}x 到 ${recommended}x`;
    }

    return report;
  }
}
