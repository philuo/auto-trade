/**
 * 仓位控制器
 *
 * 功能：
 * - 计算和限制仓位大小
 * - 管理资金分配
 * - 风险检查
 * - 仓位再平衡
 */

import type { AllowedCoin, CapitalConfig } from '../config/strategy-config';
import type { CoinPosition } from '../config/types';

// =====================================================
// 仓位限制
// =====================================================

export interface PositionLimit {
  coin: AllowedCoin;
  maxSize: number;              // 最大仓位大小（USDT）
  maxPercentage: number;        // 最大仓位百分比
  currentSize: number;           // 当前仓位大小
  currentPercentage: number;     // 当前仓位百分比
  available: number;             // 可用额度
}

// =====================================================
// 仓位控制配置
// =====================================================

export interface PositionControllerConfig {
  totalCapital: number;
  emergencyReserve: number;      // 应急储备比例 (%)
  maxCapitalPerCoin: number;     // 单币种最大资金比例 (%)
  minCapitalPerCoin: number;     // 单币种最小资金（USDT）
  enableDiversification: boolean; // 启用分散投资
}

// =====================================================
/// 仓位检查结果
// =====================================================

export interface PositionCheckResult {
  allowed: boolean;
  reason?: string;
  maxSize?: number;
  recommendedSize?: number;
}

// =====================================================
// 仓位控制器类
// =====================================================

export class PositionController {
  private config: PositionControllerConfig;
  private positions: Map<AllowedCoin, CoinPosition> = new Map();

  constructor(config: PositionControllerConfig) {
    this.config = config;
  }

  /**
   * 更新仓位信息
   */
  updatePosition(position: CoinPosition): void {
    this.positions.set(position.coin as AllowedCoin, position);
  }

  /**
   * 获取仓位信息
   */
  getPosition(coin: AllowedCoin): CoinPosition | undefined {
    return this.positions.get(coin);
  }

  /**
   * 检查订单是否允许
   */
  async checkOrder(
    coin: AllowedCoin,
    side: 'buy' | 'sell',
    size: number,
    price: number
  ): Promise<PositionCheckResult> {
    const position = this.positions.get(coin);
    const orderValue = size * price;

    // 1. 检查总资金是否充足
    const totalAvailable = this.calculateTotalAvailable();
    if (side === 'buy' && orderValue > totalAvailable) {
      return {
        allowed: false,
        reason: `订单价值 ${orderValue.toFixed(2)} USDT 超过可用资金 ${totalAvailable.toFixed(2)} USDT`
      };
    }

    // 2. 检查单币种仓位限制
    const currentSize = position ? position.value : 0;
    const newSize = side === 'buy' ? currentSize + orderValue : currentSize;
    const totalValue = this.config.totalCapital;
    const newPercentage = (newSize / totalValue) * 100;

    if (newPercentage > this.config.maxCapitalPerCoin) {
      return {
        allowed: false,
        reason: `新仓位比例 ${newPercentage.toFixed(1)}% 超过最大限制 ${this.config.maxCapitalPerCoin}%`,
        maxSize: totalValue * (this.config.maxCapitalPerCoin / 100),
        recommendedSize: totalValue * (this.config.maxCapitalPerCoin / 100) - currentSize
      };
    }

    // 3. 检查最小仓位
    if (side === 'buy' && orderValue < this.config.minCapitalPerCoin) {
      return {
        allowed: false,
        reason: `订单价值 ${orderValue.toFixed(2)} USDT 小于最小值 ${this.config.minCapitalPerCoin} USDT`
      };
    }

    return {
      allowed: true
    };
  }

  /**
   * 计算推荐订单大小
   */
  calculateRecommendedSize(
    coin: AllowedCoin,
    side: 'buy' | 'sell',
    price: number,
    aggressive: boolean = false
  ): { size: number; value: number } {
    const position = this.positions.get(coin);
    const currentSize = position ? position.value : 0;
    const totalValue = this.config.totalCapital;

    let targetPercentage: number;

    if (aggressive) {
      // 激进模式：使用最大仓位的80%
      targetPercentage = this.config.maxCapitalPerCoin * 0.8;
    } else {
      // 保守模式：使用最大仓位的50%
      targetPercentage = this.config.maxCapitalPerCoin * 0.5;
    }

    const targetValue = totalValue * (targetPercentage / 100);
    const availableValue = targetValue - currentSize;

    // 如果是卖出，不能超过当前持仓
    if (side === 'sell') {
      const actualAvailable = position ? position.amount * price : 0;
      return {
        size: actualAvailable,
        value: actualAvailable * price
      };
    }

    // 买入：检查可用资金
    const totalAvailable = this.calculateTotalAvailable();
    const actualAvailable = Math.min(availableValue, totalAvailable);

    return {
      size: actualAvailable / price,
      value: actualAvailable
    };
  }

  /**
   * 计算总可用资金
   */
  private calculateTotalAvailable(): number {
    // 计算当前持仓总价值
    let currentPositionValue = 0;
    for (const position of this.positions.values()) {
      currentPositionValue += position.value;
    }

    // 计算可用资金
    const emergencyReserve = this.config.totalCapital * (this.config.emergencyReserve / 100);
    const available = this.config.totalCapital - currentPositionValue - emergencyReserve;

    return Math.max(0, available);
  }

  /**
   * 获取仓位限制
   */
  getPositionLimit(coin: AllowedCoin): PositionLimit {
    const position = this.positions.get(coin);
    const currentSize = position ? position.value : 0;
    const totalValue = this.config.totalCapital;

    return {
      coin,
      maxSize: totalValue * (this.config.maxCapitalPerCoin / 100),
      maxPercentage: this.config.maxCapitalPerCoin,
      currentSize,
      currentPercentage: (currentSize / totalValue) * 100,
      available: Math.max(0, totalValue * (this.config.maxCapitalPerCoin / 100) - currentSize)
    };
  }

  /**
   * 获取所有仓位限制
   */
  getAllPositionLimits(): PositionLimit[] {
    const limits: PositionLimit[] = [];

    for (const coin of this.positions.keys()) {
      limits.push(this.getPositionLimit(coin));
    }

    return limits;
  }

  /**
   * 重新平衡仓位
   */
  async rebalancePositions(): Promise<{ [key: string]: { from: string; to: string; amount: number }[] }> {
    const rebalanceActions: { [key: string]: { from: string; to: string; amount: number }[] } = {};

    // 获取所有仓位的当前比例
    const totalValue = this.config.totalCapital;
    const targetPercentage = 100 / this.positions.size; // 均匀分配

    // 计算需要调整的仓位
    for (const [coin, position] of this.positions) {
      const currentPercentage = (position.value / totalValue) * 100;
      const diff = currentPercentage - targetPercentage;

      if (Math.abs(diff) > 5) { // 差异超过5%才调整
        const adjustValue = (totalValue * diff) / 100;

        if (adjustValue > 0) {
          // 需要买入
          rebalanceActions[coin] = rebalanceActions[coin] || [];
          rebalanceActions[coin].push({
            from: 'USDT',
            to: coin,
            amount: adjustValue
          });
        } else {
          // 需要卖出
          const sellAmount = Math.abs(adjustValue);
          const sellSize = sellAmount / position.currentPrice;

          rebalanceActions[coin] = rebalanceActions[coin] || [];
          rebalanceActions[coin].push({
            from: coin,
            to: 'USDT',
            amount: sellSize
          });
        }
      }
    }

    return rebalanceActions;
  }

  /**
   * 计算仓位风险指标
   */
  calculateRiskMetrics(coin: AllowedCoin): {
    concentration: number;
    exposure: number;
    riskLevel: 'low' | 'medium' | 'high';
  } {
    const position = this.positions.get(coin);
    if (!position) {
      return {
        concentration: 0,
        exposure: 0,
        riskLevel: 'low'
      };
    }

    const totalValue = this.config.totalCapital;
    const concentration = (position.value / totalValue) * 100;
    const exposure = position.value;

    // 风险等级评估
    let riskLevel: 'low' | 'medium' | 'high' = 'low';

    if (concentration > 30) {
      riskLevel = 'high';
    } else if (concentration > 15) {
      riskLevel = 'medium';
    }

    return {
      concentration,
      exposure,
      riskLevel
    };
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<PositionControllerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取配置
   */
  getConfig(): PositionControllerConfig {
    return { ...this.config };
  }

  /**
   * 清除所有仓位
   */
  clearPositions(): void {
    this.positions.clear();
  }

  /**
   * 生成报告
   */
  generateReport(): string {
    let report = '仓位控制报告\n========================\n';

    report += `总资金: ${this.config.totalCapital.toFixed(2)} USDT\n`;
    report += `应急储备: ${(this.config.emergencyReserve).toFixed(1)}%\n`;
    report += `单币种最大比例: ${(this.config.maxCapitalPerCoin).toFixed(1)}%\n`;
    report += `分散投资: ${this.config.enableDiversification ? '启用' : '禁用'}\n`;

    report += '\n仓位详情:\n';
    for (const [coin, position] of this.positions) {
      const limit = this.getPositionLimit(coin);
      const metrics = this.calculateRiskMetrics(coin);

      report += `\n${coin}:\n`;
      report += `  当前仓位: ${position.amount.toFixed(6)} @ ${position.avgPrice.toFixed(2)}\n`;
      report += `  当前价值: ${position.value.toFixed(2)} USDT\n`;
      report += `  当前比例: ${limit.currentPercentage.toFixed(1)}% / ${limit.maxPercentage.toFixed(1)}%\n`;
      report += `  可用额度: ${limit.available.toFixed(2)} USDT\n`;
      report += `  风险等级: ${metrics.riskLevel}\n`;
      report += `  未实现盈亏: ${position.unrealizedPnL.toFixed(2)} USDT (${position.unrealizedPnLPercent.toFixed(2)}%)\n`;
    }

    const totalAvailable = this.calculateTotalAvailable();
    report += `\n可用资金: ${totalAvailable.toFixed(2)} USDT\n`;

    return report;
  }
}
