/**
 * 风险管理模块
 *
 * 功能：
 * - 实时风险监控
 * - 回撤控制
 * - 止损止盈
 * - 紧急平仓
 */

// =====================================================
// 风险等级
// =====================================================

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface RiskAssessment {
  level: RiskLevel;
  score: number;                   // 风险评分 0-100
  factors: RiskFactor[];
  recommendations: string[];
  actions: RiskAction[];
}

export interface RiskFactor {
  name: string;
  value: number;
  threshold: number;
  status: 'normal' | 'warning' | 'danger';
  weight: number;                  // 权重 0-1
}

export interface RiskAction {
  type: 'pause' | 'reduce' | 'close' | 'hedge' | 'adjust';
  target: string;                  // 目标币种或'all'
  priority: 'low' | 'medium' | 'high' | 'urgent';
  description: string;
}

// =====================================================
// 仓位信息
// =====================================================

export interface PositionRisk {
  coin: string;
  type: 'spot' | 'swap' | 'long' | 'short';
  size: number;
  value: number;
  unrealizedPnL: number;
  unrealizedPnLPercent: number;
  liquidationPrice?: number;
  distanceToLiquidation?: number;
}

// =====================================================
// 风险管理器类
// =====================================================

export class RiskManager {
  private maxDrawdown: number;
  private warningDrawdown: number;
  private emergencyDrawdown: number;
  private maxPositionSize: number;
  private stopLossPercent: number;

  private peakEquity: number = 0;
  private currentEquity: number = 0;
  private currentDrawdown: number = 0;

  constructor(config: {
    maxDrawdown?: number;
    warningDrawdown?: number;
    emergencyDrawdown?: number;
    maxPositionSize?: number;
    stopLossPercent?: number;
  }) {
    this.maxDrawdown = config.maxDrawdown || 20;
    this.warningDrawdown = config.warningDrawdown || 10;
    this.emergencyDrawdown = config.emergencyDrawdown || 30;
    this.maxPositionSize = config.maxPositionSize || 0.3; // 单币种最大30%
    this.stopLossPercent = config.stopLossPercent || 15;
  }

  /**
   * 评估整体风险
   */
  assessOverallRisk(
    totalEquity: number,
    positions: PositionRisk[],
    initialCapital: number
  ): RiskAssessment {
    // 更新权益
    this.currentEquity = totalEquity;
    if (totalEquity > this.peakEquity) {
      this.peakEquity = totalEquity;
    }

    // 计算回撤
    this.currentDrawdown = ((this.peakEquity - totalEquity) / this.peakEquity) * 100;

    const factors: RiskFactor[] = [];
    let totalScore = 0;

    // 1. 回撤风险
    const drawdownFactor = this.assessDrawdownRisk();
    factors.push(drawdownFactor);
    totalScore += drawdownFactor.value * drawdownFactor.weight;

    // 2. 仓位集中度风险
    const concentrationFactor = this.assessConcentrationRisk(positions, totalEquity);
    factors.push(concentrationFactor);
    totalScore += concentrationFactor.value * concentrationFactor.weight;

    // 3. 单币种风险
    const positionRisk = this.assessPositionRisk(positions);
    factors.push(...positionRisk);
    positionRisk.forEach(f => {
      totalScore += f.value * f.weight;
    });

    // 4. 杠杆风险（合约）
    const leverageRisk = this.assessLeverageRisk(positions);
    if (leverageRisk) {
      factors.push(leverageRisk);
      totalScore += leverageRisk.value * leverageRisk.weight;
    }

    // 确定风险等级
    const level = this.determineRiskLevel(totalScore);

    // 生成建议和操作
    const { recommendations, actions } = this.generateRecommendations(level, factors);

    return {
      level,
      score: Math.round(totalScore),
      factors,
      recommendations,
      actions
    };
  }

  /**
   * 评估回撤风险
   */
  private assessDrawdownRisk(): RiskFactor {
    const value = this.currentDrawdown;
    const threshold = this.maxDrawdown;

    let status: 'normal' | 'warning' | 'danger';

    if (value >= this.emergencyDrawdown) {
      status = 'danger';
    } else if (value >= this.warningDrawdown) {
      status = 'warning';
    } else {
      status = 'normal';
    }

    return {
      name: '回撤风险',
      value: (value / this.emergencyDrawdown) * 100,
      threshold,
      status,
      weight: 0.35 // 回撤权重最高
    };
  }

  /**
   * 评估仓位集中度风险
   */
  private assessConcentrationRisk(positions: PositionRisk[], totalEquity: number): RiskFactor {
    let maxConcentration = 0;
    let maxCoin = '';

    for (const pos of positions) {
      const concentration = pos.value / totalEquity;
      if (concentration > maxConcentration) {
        maxConcentration = concentration;
        maxCoin = pos.coin;
      }
    }

    const threshold = this.maxPositionSize * 100;
    const value = (maxConcentration / this.maxPositionSize) * 100;

    let status: 'normal' | 'warning' | 'danger';
    if (maxConcentration > this.maxPositionSize * 1.5) {
      status = 'danger';
    } else if (maxConcentration > this.maxPositionSize) {
      status = 'warning';
    } else {
      status = 'normal';
    }

    return {
      name: `集中度风险 (${maxCoin})`,
      value,
      threshold,
      status,
      weight: 0.2
    };
  }

  /**
   * 评估单个仓位风险
   */
  private assessPositionRisk(positions: PositionRisk[]): RiskFactor[] {
    const factors: RiskFactor[] = [];

    for (const pos of positions) {
      if (pos.unrealizedPnLPercent < -this.stopLossPercent) {
        factors.push({
          name: `${pos.coin} 亏损风险`,
          value: Math.abs(pos.unrealizedPnLPercent),
          threshold: this.stopLossPercent,
          status: 'danger',
          weight: 0.15
        });
      } else if (pos.unrealizedPnLPercent < -this.stopLossPercent * 0.7) {
        factors.push({
          name: `${pos.coin} 亏损警告`,
          value: Math.abs(pos.unrealizedPnLPercent),
          threshold: this.stopLossPercent,
          status: 'warning',
          weight: 0.1
        });
      }

      // 检查强平风险
      if (pos.distanceToLiquidation !== undefined && pos.distanceToLiquidation < 10) {
        factors.push({
          name: `${pos.coin} 强平风险`,
          value: 100 - pos.distanceToLiquidation,
          threshold: 90,
          status: 'danger',
          weight: 0.25
        });
      }
    }

    return factors;
  }

  /**
   * 评估杠杆风险
   */
  private assessLeverageRisk(positions: PositionRisk[]): RiskFactor | null {
    const swapPositions = positions.filter(p => p.type === 'long' || p.type === 'short');

    if (swapPositions.length === 0) return null;

    let totalLeverage = 0;
    let maxLeverage = 0;

    for (const pos of swapPositions) {
      // 简化计算，实际需要根据持仓计算
      const leverage = pos.value / (pos.value - pos.unrealizedPnL);
      totalLeverage += leverage;
      maxLeverage = Math.max(maxLeverage, leverage);
    }

    const avgLeverage = totalLeverage / swapPositions.length;
    const threshold = 5; // 最大5倍杠杆

    return {
      name: '杠杆风险',
      value: (avgLeverage / threshold) * 100,
      threshold,
      status: avgLeverage > threshold ? 'danger' : avgLeverage > 3 ? 'warning' : 'normal',
      weight: 0.15
    };
  }

  /**
   * 确定风险等级
   */
  private determineRiskLevel(score: number): RiskLevel {
    if (score >= 80) return 'critical';
    if (score >= 60) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  }

  /**
   * 生成建议和操作
   */
  private generateRecommendations(
    level: RiskLevel,
    factors: RiskFactor[]
  ): { recommendations: string[]; actions: RiskAction[] } {
    const recommendations: string[] = [];
    const actions: RiskAction[] = [];

    // 根据风险等级生成建议
    switch (level) {
      case 'critical':
        recommendations.push('风险极高！立即停止所有交易');
        recommendations.push('执行紧急平仓计划');
        recommendations.push('重新评估策略');
        actions.push({
          type: 'close',
          target: 'all',
          priority: 'urgent',
          description: '紧急平仓所有持仓'
        });
        break;

      case 'high':
        recommendations.push('风险较高，暂停新开仓');
        recommendations.push('考虑减仓或对冲');
        actions.push({
          type: 'pause',
          target: 'all',
          priority: 'high',
          description: '暂停新开仓'
        });
        actions.push({
          type: 'reduce',
          target: 'all',
          priority: 'high',
          description: '减少高风险仓位'
        });
        break;

      case 'medium':
        recommendations.push('风险中等，密切关注');
        recommendations.push('设置止损');
        actions.push({
          type: 'adjust',
          target: 'all',
          priority: 'medium',
          description: '调整止损位'
        });
        break;

      case 'low':
        recommendations.push('风险较低，正常交易');
        break;
    }

    // 根据具体风险因素生成针对性建议
    for (const factor of factors) {
      if (factor.status === 'danger') {
        recommendations.push(`${factor.name} 超出阈值！`);
        if (factor.name.includes('强平')) {
          actions.push({
            type: 'close',
            target: factor.name.split(' ')[0],
            priority: 'urgent',
            description: '立即平仓避免强平'
          });
        }
      } else if (factor.status === 'warning') {
        recommendations.push(`${factor.name} 接近阈值`);
      }
    }

    return { recommendations, actions };
  }

  /**
   * 生成风险报告
   */
  generateRiskReport(assessment: RiskAssessment): string {
    const levelEmoji = {
      low: '✅',
      medium: '⚠️',
      high: '🔶',
      critical: '🚨'
    };

    let report = `
${levelEmoji[assessment.level]} 风险评估报告
${'='.repeat(60)}

风险等级: ${assessment.level.toUpperCase()}
风险评分: ${assessment.score}/100

当前状态:
  当前权益: ${this.currentEquity.toFixed(2)} USDT
  峰值权益: ${this.peakEquity.toFixed(2)} USDT
  当前回撤: ${this.currentDrawdown.toFixed(2)}%
  最大回撤: ${this.maxDrawdown}%

风险因素:
`;

    for (const factor of assessment.factors) {
      const statusEmoji = {
        normal: '✅',
        warning: '⚠️',
        danger: '🚨'
      };

      report += `  ${statusEmoji[factor.status]} ${factor.name}: ${factor.value.toFixed(1)}% (阈值: ${factor.threshold}%)\n`;
    }

    report += `
建议:
${assessment.recommendations.map(r => `  • ${r}`).join('\n')}
`;

    if (assessment.actions.length > 0) {
      report += `
需要执行的操作:
`;
      for (const action of assessment.actions) {
        const priorityEmoji = {
          low: '📝',
          medium: '⚠️',
          high: '🔶',
          urgent: '🚨'
        };
        report += `  ${priorityEmoji[action.priority]} [${action.priority.toUpperCase()}] ${action.description}\n`;
      }
    }

    return report;
  }

  /**
   * 重置峰值权益（用于资金调整后）
   */
  resetPeakEquity(newEquity: number): void {
    this.peakEquity = newEquity;
  }

  /**
   * 获取当前回撤
   */
  getCurrentDrawdown(): number {
    return this.currentDrawdown;
  }

  /**
   * 检查是否需要止损
   */
  shouldStopLoss(position: PositionRisk): boolean {
    return position.unrealizedPnLPercent <= -this.stopLossPercent;
  }

  /**
   * 计算止损价格
   */
  calculateStopLossPrice(entryPrice: number, side: 'long' | 'short'): number {
    if (side === 'long') {
      return entryPrice * (1 - this.stopLossPercent / 100);
    } else {
      return entryPrice * (1 + this.stopLossPercent / 100);
    }
  }

  /**
   * 计算止盈价格
   */
  calculateTakeProfitPrice(entryPrice: number, side: 'long' | 'short', profitPercent: number = 10): number {
    if (side === 'long') {
      return entryPrice * (1 + profitPercent / 100);
    } else {
      return entryPrice * (1 - profitPercent / 100);
    }
  }
}
