/**
 * 交易频率控制器
 *
 * 防止过度交易，确保交易质量
 * 支持多种交易频率模式：高频、中频、低频
 */

/**
 * 交易频率模式
 */
export enum TradingFrequencyMode {
  /** 高频（1-5分钟，适合合约） */
  HIGH_FREQUENCY = 'HIGH_FREQUENCY',
  /** 中频（15分钟，推荐） */
  MEDIUM_FREQUENCY = 'MEDIUM_FREQUENCY',
  /** 低频（1小时+，稳健） */
  LOW_FREQUENCY = 'LOW_FREQUENCY',
}

/**
 * 交易频率配置
 */
export interface TradingFrequencyConfig {
  /** 最小交易间隔（毫秒） */
  minTradeInterval: number;
  /** 每日最大交易次数 */
  maxTradesPerDay: number;
  /** 最小置信度 */
  minConfidence: number;
  /** 最小利润目标（百分比，如0.005=0.5%） */
  minProfitTarget: number;
  /** 描述 */
  description: string;
}

/**
 * 预设配置
 */
export const FREQUENCY_CONFIGS: Record<TradingFrequencyMode, TradingFrequencyConfig> = {
  [TradingFrequencyMode.HIGH_FREQUENCY]: {
    minTradeInterval: 3 * 60 * 1000,      // 3分钟
    maxTradesPerDay: 20,                 // 每天20次
    minConfidence: 0.75,                 // 更高置信度
    minProfitTarget: 0.005,              // 0.5%（覆盖手续费）
    description: '高频模式（1-5分钟）- 仅推荐合约使用，手续费敏感',
  },
  [TradingFrequencyMode.MEDIUM_FREQUENCY]: {
    minTradeInterval: 15 * 60 * 1000,     // 15分钟
    maxTradesPerDay: 8,                  // 每天8次
    minConfidence: 0.65,
    minProfitTarget: 0.015,              // 1.5%
    description: '中频模式（15分钟）- 推荐使用，平衡点',
  },
  [TradingFrequencyMode.LOW_FREQUENCY]: {
    minTradeInterval: 60 * 60 * 1000,     // 1小时
    maxTradesPerDay: 3,                  // 每天3次
    minConfidence: 0.60,
    minProfitTarget: 0.03,               // 3%
    description: '低频模式（1小时+）- 稳健，手续费影响小',
  },
};

export class TradingFrequencyController {
  private config: TradingFrequencyConfig;
  private lastTradeTime = new Map<string, number>();
  private tradeCount = new Map<string, number>();

  constructor(
    mode: TradingFrequencyMode = TradingFrequencyMode.MEDIUM_FREQUENCY,
    customConfig?: Partial<TradingFrequencyConfig>
  ) {
    this.config = {
      ...FREQUENCY_CONFIGS[mode],
      ...customConfig,
    };
  }

  /**
   * 检查是否允许交易
   */
  canTrade(
    coin: string,
    signalType: string,
    timestamp: number,
    confidence?: number,
    expectedProfit?: number
  ): { allowed: boolean; reason?: string } {
    const key = `${coin}_${signalType}`;
    const now = timestamp;

    // 1. 检查置信度
    if (confidence !== undefined && confidence < this.config.minConfidence) {
      return {
        allowed: false,
        reason: `置信度不足 (${(confidence * 100).toFixed(0)}% < ${(this.config.minConfidence * 100).toFixed(0)}%)`,
      };
    }

    // 2. 检查预期利润
    if (expectedProfit !== undefined && expectedProfit < this.config.minProfitTarget) {
      return {
        allowed: false,
        reason: `预期利润不足 (${(expectedProfit * 100).toFixed(2)}% < ${(this.config.minProfitTarget * 100).toFixed(2)}%)`,
      };
    }

    // 3. 检查最小间隔
    const lastTime = this.lastTradeTime.get(key) || 0;
    if (now - lastTime < this.config.minTradeInterval) {
      const minutes = Math.ceil((this.config.minTradeInterval - (now - lastTime)) / 60000);
      return {
        allowed: false,
        reason: `距离上次交易不足${minutes}分钟`,
      };
    }

    // 4. 检查每日交易次数
    const today = new Date(now).setHours(0, 0, 0, 0);
    const todayKey = `${coin}_${today}`;
    const todayTrades = this.tradeCount.get(todayKey) || 0;
    if (todayTrades >= this.config.maxTradesPerDay) {
      return {
        allowed: false,
        reason: `今日交易次数已达上限(${this.config.maxTradesPerDay}次)`,
      };
    }

    return { allowed: true };
  }

  /**
   * 记录一次交易
   */
  recordTrade(coin: string, signalType: string, timestamp: number): void {
    const key = `${coin}_${signalType}`;
    this.lastTradeTime.set(key, timestamp);

    const today = new Date(timestamp).setHours(0, 0, 0, 0);
    const todayKey = `${coin}_${today}`;
    this.tradeCount.set(todayKey, (this.tradeCount.get(todayKey) || 0) + 1);
  }

  /**
   * 获取交易统计
   */
  getStats(coin: string, date: Date): {
    tradesToday: number;
    canTradeMore: boolean;
    lastTradeMinutesAgo: number;
    maxTradesPerDay: number;
    minTradeIntervalMinutes: number;
  } {
    const today = date.setHours(0, 0, 0, 0);
    const todayTrades = this.tradeCount.get(`${coin}_${today}`) || 0;
    const lastTime = this.lastTradeTime.get(coin) || 0;

    return {
      tradesToday: todayTrades,
      canTradeMore: todayTrades < this.config.maxTradesPerDay,
      lastTradeMinutesAgo: Math.floor((Date.now() - lastTime) / 60000),
      maxTradesPerDay: this.config.maxTradesPerDay,
      minTradeIntervalMinutes: Math.floor(this.config.minTradeInterval / 60000),
    };
  }

  /**
   * 获取当前配置信息
   */
  getConfig(): TradingFrequencyConfig {
    return { ...this.config };
  }

  /**
   * 重置统计（用于测试）
   */
  reset(): void {
    this.lastTradeTime.clear();
    this.tradeCount.clear();
  }
}
