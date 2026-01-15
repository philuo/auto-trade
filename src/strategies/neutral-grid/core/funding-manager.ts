/**
 * 资金费率管理器
 *
 * 功能：
 * - 监控永续合约资金费率
 * - 计算资金费用收入/支出
 * - 高费率时执行套利策略
 * - 优化仓位以减少资金费成本
 */

import type {
  SwapAllowedCoin,
  FundingRateConfig,
  SwapMarketData,
  CoinGridState,
  NeutralGridDecision
} from '../config/types';

// =====================================================
// 资金费率信息
// =====================================================

export interface FundingRateInfo {
  coin: SwapAllowedCoin;
  currentRate: number;             // 当前费率
  predictedRate: number;           // 预测费率
  nextFundingTime: number;         // 下次结算时间
  impact: number;                  // 对当前仓位的影响（USDT）
  recommendation: 'hold' | 'hedge' | 'reduce' | 'close';
  reason: string;
}

// =====================================================
// 资金费率管理器类
// =====================================================

export class FundingRateManager {
  private config: FundingRateConfig;
  private fundingHistory: Map<SwapAllowedCoin, number[]> = new Map();
  private lastCheckTime: number = 0;

  constructor(config: FundingRateConfig) {
    this.config = config;
  }

  /**
   * 检查资金费率并生成决策
   */
  checkFundingRate(
    coin: SwapAllowedCoin,
    marketData: SwapMarketData,
    coinState: CoinGridState
  ): FundingRateInfo {
    const currentRate = marketData.fundingRate;
    const predictedRate = this.predictFundingRate(coin);

    // 计算对当前仓位的影响
    const longExposure = coinState.longPosition.size;
    const shortExposure = coinState.shortPosition.size;
    const netExposure = longExposure - shortExposure;

    // 每8小时费率，转换为年化
    const dailyRate = currentRate * 3;  // 每天3次
    const impact = (netExposure * dailyRate) / 100;

    // 生成建议
    const recommendation = this.generateRecommendation(
      currentRate,
      netExposure,
      coinState
    );

    return {
      coin,
      currentRate,
      predictedRate,
      nextFundingTime: marketData.nextFundingTime,
      impact,
      recommendation: recommendation.action,
      reason: recommendation.reason
    };
  }

  /**
   * 预测资金费率
   */
  private predictFundingRate(coin: SwapAllowedCoin): number {
    const history = this.fundingHistory.get(coin) || [];
    if (history.length < 2) return 0;

    // 简单移动平均预测
    const sum = history.slice(-5).reduce((a, b) => a + b, 0);
    return sum / Math.min(history.length, 5);
  }

  /**
   * 生成建议
   */
  private generateRecommendation(
    currentRate: number,
    netExposure: number,
    coinState: CoinGridState
  ): { action: 'hold' | 'hedge' | 'reduce' | 'close'; reason: string } {
    const { arbitrage, monitoring } = this.config;
    const absRate = Math.abs(currentRate);

    // 高费率检查
    if (absRate > this.config.arbitrage.threshold) {
      if (currentRate > 0) {
        // 正费率：多头付费，空头收费
        if (netExposure > 0) {
          return {
            action: 'reduce',
            reason: `正费率 ${currentRate.toFixed(4)}%，建议减少多头敞口`
          };
        } else if (netExposure < 0) {
          return {
            action: 'hedge',
            reason: `正费率 ${currentRate.toFixed(4)}%，当前空头敞口可收取资金费`
          };
        }
      } else {
        // 负费率：空头付费，多头收费
        if (netExposure < 0) {
          return {
            action: 'reduce',
            reason: `负费率 ${currentRate.toFixed(4)}%，建议减少空头敞口`
          };
        } else if (netExposure > 0) {
          return {
            action: 'hedge',
            reason: `负费率 ${currentRate.toFixed(4)}%，当前多头敞口可收取资金费`
          };
        }
      }
    }

    // 套利机会检查
    if (arbitrage.enabled && absRate > arbitrage.threshold) {
      const profit = absRate * Math.abs(netExposure) / 100;
      if (profit > coinState.allocatedCapital * (arbitrage.minProfit / 100)) {
        return {
          action: 'hedge',
          reason: `套利机会：费率 ${currentRate.toFixed(4)}%，预期收益 ${profit.toFixed(2)} USDT`
        };
      }
    }

    return {
      action: 'hold',
      reason: `费率 ${currentRate.toFixed(4)}%，正常范围`
    };
  }

  /**
   * 计算资金费用
   */
  calculateFundingFee(
    coinState: CoinGridState,
    fundingRate: number
  ): number {
    // 资金费用 = 净仓位 × 费率
    const netExposure = coinState.longPosition.size - coinState.shortPosition.size;
    return (netExposure * fundingRate) / 100;
  }

  /**
   * 记录资金费率历史
   */
  recordFundingRate(coin: SwapAllowedCoin, rate: number): void {
    const history = this.fundingHistory.get(coin) || [];
    history.push(rate);

    // 保留最近100个记录
    if (history.length > 100) {
      history.shift();
    }

    this.fundingHistory.set(coin, history);
  }

  /**
   * 生成资金费率报告
   */
  generateReport(coin: SwapAllowedCoin, marketData: SwapMarketData): string {
    const currentRate = marketData.fundingRate;
    const dailyRate = currentRate * 3;
    const annualRate = currentRate * 3 * 365;

    let report = `
${coin} 资金费率信息
${'='.repeat(60)}
当前费率: ${(currentRate * 100).toFixed(4)}% (8小时)
日化费率: ${(dailyRate * 100).toFixed(4)}%
年化费率: ${(annualRate * 100).toFixed(2)}%

下次结算: ${new Date(marketData.nextFundingTime).toLocaleString()}
标记价格: ${marketData.markPrice.toFixed(2)}
指数价格: ${marketData.indexPrice.toFixed(2)}
溢价: ${((marketData.markPrice - marketData.indexPrice) / marketData.indexPrice * 100).toFixed(4)}%

历史费率:
`;

    const history = this.fundingHistory.get(coin) || [];
    if (history.length > 0) {
      const recent = history.slice(-5);
      report += recent.map((rate, i) =>
        `  ${i + 1}. ${(rate * 100).toFixed(4)}%`
      ).join('\n');
    } else {
      report += '  暂无历史数据';
    }

    return report;
  }

  /**
   * 更新检查时间
   */
  updateCheckTime(): void {
    this.lastCheckTime = Date.now();
  }

  /**
   * 检查是否需要更新
   */
  needsUpdate(): boolean {
    const now = Date.now();
    const elapsed = now - this.lastCheckTime;
    const interval = this.config.monitoring.checkInterval * 60 * 1000;

    return elapsed >= interval;
  }
}
