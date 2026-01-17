/**
 * 交易约束配置
 *
 * 实现风险控制规则：
 * 1. 币种白名单
 * 2. 杠杆限制
 * 3. 强制止盈止损
 * 4. 交易类型限制
 */

/**
 * 交易模式
 */
export enum TradingMode {
  /** 现货交易 */
  SPOT = 'SPOT',
  /** 永续合约 */
  PERPETUAL = 'PERPETUAL',
}

/**
 * 币种白名单配置
 */
export const WHITELIST_CONFIG = {
  /** 现货允许的币种 */
  spot: ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE'] as const,

  /** 合约允许的币种 */
  perpetual: ['BTC', 'ETH'] as const,
} as const;

/**
 * 杠杆限制配置
 */
export const LEVERAGE_CONFIG = {
  /** BTC最大杠杆 */
  BTC: 5,

  /** ETH最大杠杆 */
  ETH: 3,

  /** 默认最大杠杆 */
  DEFAULT: 1,
} as const;

/**
 * 默认止损止盈配置
 */
export const DEFAULT_STOP_CONFIG = {
  /** 默认止损距离（百分比） */
  stopLossDistance: 0.02,  // 2%

  /** 默认止盈距离（百分比） */
  takeProfitDistance: 0.05, // 5%

  /** 最小止损距离（防止过于激进） */
  minStopLoss: 0.005,  // 0.5%

  /** 最大止损距离（防止过于保守） */
  maxStopLoss: 0.10,  // 10%

  /** 最小止盈距离 */
  minTakeProfit: 0.01,  // 1%
} as const;

/**
 * 交易约束检查结果
 */
export interface ConstraintCheckResult {
  /** 是否允许交易 */
  allowed: boolean;
  /** 拒绝原因 */
  reason?: string;
  /** 建议的配置 */
  suggestions?: string[];
}

/**
 * 交易参数
 */
export interface TradeParams {
  /** 币种 */
  coin: string;
  /** 交易模式 */
  mode: TradingMode;
  /** 杠杆（仅合约） */
  leverage?: number;
  /** 止损距离 */
  stopLossDistance?: number;
  /** 止盈距离 */
  takeProfitDistance?: number;
}

/**
 * 交易约束验证器
 */
export class TradingConstraintsValidator {
  /**
   * 验证交易参数是否符合约束
   */
  validate(params: TradeParams): ConstraintCheckResult {
    // 1. 检查币种白名单
    const whitelistCheck = this.checkWhitelist(params);
    if (!whitelistCheck.allowed) {
      return whitelistCheck;
    }

    // 2. 检查杠杆限制（仅合约）
    if (params.mode === TradingMode.PERPETUAL) {
      const leverageCheck = this.checkLeverage(params);
      if (!leverageCheck.allowed) {
        return leverageCheck;
      }
    }

    // 3. 检查止盈止损设置
    const stopCheck = this.checkStopConfig(params);
    if (!stopCheck.allowed) {
      return stopCheck;
    }

    return { allowed: true };
  }

  /**
   * 检查币种是否在白名单中
   */
  private checkWhitelist(params: TradeParams): ConstraintCheckResult {
    const whitelist = params.mode === TradingMode.SPOT
      ? WHITELIST_CONFIG.spot
      : WHITELIST_CONFIG.perpetual;

    if (!whitelist.includes(params.coin as any)) {
      return {
        allowed: false,
        reason: `币种 ${params.coin} 不在${params.mode === TradingMode.SPOT ? '现货' : '合约'}白名单中`,
        suggestions: [
          `允许的${params.mode === TradingMode.SPOT ? '现货' : '合约'}币种: ${whitelist.join(', ')}`,
        ],
      };
    }

    return { allowed: true };
  }

  /**
   * 检查杠杆是否在限制范围内
   */
  private checkLeverage(params: TradeParams): ConstraintCheckResult {
    if (params.leverage === undefined || params.leverage <= 0) {
      return {
        allowed: false,
        reason: '合约交易必须设置杠杆',
        suggestions: [
          `BTC建议杠杆: 1-${LEVERAGE_CONFIG.BTC}x`,
          `ETH建议杠杆: 1-${LEVERAGE_CONFIG.ETH}x`,
        ],
      };
    }

    // OKX 仅支持整数倍杠杆（1x, 2x, 3x, 5x）
    if (!Number.isInteger(params.leverage)) {
      return {
        allowed: false,
        reason: `OKX仅支持整数倍杠杆，当前设置: ${params.leverage}x`,
        suggestions: [
          `请使用整数倍杠杆: 1x, 2x, 3x, 4x, 5x`,
          `BTC最大杠杆: ${LEVERAGE_CONFIG.BTC}x`,
          `ETH最大杠杆: ${LEVERAGE_CONFIG.ETH}x`,
        ],
      };
    }

    const maxLeverage = LEVERAGE_CONFIG[params.coin as keyof typeof LEVERAGE_CONFIG] || LEVERAGE_CONFIG.DEFAULT;

    if (params.leverage > maxLeverage) {
      return {
        allowed: false,
        reason: `${params.coin}杠杆超过限制 (${params.leverage}x > ${maxLeverage}x)`,
        suggestions: [
          `建议使用 ${maxLeverage}x 或更低的杠杆`,
        ],
      };
    }

    if (params.leverage < 1) {
      return {
        allowed: false,
        reason: '杠杆不能小于1',
      };
    }

    return { allowed: true };
  }

  /**
   * 检查止盈止损配置
   */
  private checkStopConfig(params: TradeParams): ConstraintCheckResult {
    // 检查是否设置了止损止盈
    if (params.stopLossDistance === undefined || params.takeProfitDistance === undefined) {
      return {
        allowed: false,
        reason: '下单时必须设置止盈止损',
        suggestions: [
          `默认止损: ${(DEFAULT_STOP_CONFIG.stopLossDistance * 100).toFixed(1)}%`,
          `默认止盈: ${(DEFAULT_STOP_CONFIG.takeProfitDistance * 100).toFixed(1)}%`,
        ],
      };
    }

    // 检查止损距离范围
    if (params.stopLossDistance < DEFAULT_STOP_CONFIG.minStopLoss) {
      return {
        allowed: false,
        reason: `止损距离过小 (${(params.stopLossDistance * 100).toFixed(2)}% < ${(DEFAULT_STOP_CONFIG.minStopLoss * 100).toFixed(1)}%)`,
        suggestions: [
          `最小止损: ${(DEFAULT_STOP_CONFIG.minStopLoss * 100).toFixed(1)}%`,
          '过小的止损容易被正常波动触发',
        ],
      };
    }

    if (params.stopLossDistance > DEFAULT_STOP_CONFIG.maxStopLoss) {
      return {
        allowed: false,
        reason: `止损距离过大 (${(params.stopLossDistance * 100).toFixed(1)}% > ${(DEFAULT_STOP_CONFIG.maxStopLoss * 100).toFixed(1)}%)`,
        suggestions: [
          `最大止损: ${(DEFAULT_STOP_CONFIG.maxStopLoss * 100).toFixed(1)}%`,
        ],
      };
    }

    // 检查止盈距离
    if (params.takeProfitDistance < DEFAULT_STOP_CONFIG.minTakeProfit) {
      return {
        allowed: false,
        reason: `止盈距离过小 (${(params.takeProfitDistance * 100).toFixed(2)}% < ${(DEFAULT_STOP_CONFIG.minTakeProfit * 100).toFixed(1)}%)`,
      };
    }

    // 检查风险回报比
    const riskRewardRatio = params.takeProfitDistance / params.stopLossDistance;
    if (riskRewardRatio < 1.5) {
      return {
        allowed: false,
        reason: `风险回报比不合理 (${riskRewardRatio.toFixed(2)} < 1.5)`,
        suggestions: [
          '建议止盈至少是止损的1.5倍',
          `当前: 止损${(params.stopLossDistance * 100).toFixed(1)}%, 止盈${(params.takeProfitDistance * 100).toFixed(1)}%`,
          `建议: 止盈至少 ${(params.stopLossDistance * 1.5 * 100).toFixed(1)}%`,
        ],
      };
    }

    return { allowed: true };
  }

  /**
   * 获取币种建议的默认止损止盈
   */
  getDefaultStopConfig(coin: string, volatility?: 'low' | 'normal' | 'high'): {
    stopLossDistance: number;
    takeProfitDistance: number;
  } {
    // 根据波动率调整
    const volatilityMultiplier = volatility === 'high' ? 1.5 : volatility === 'low' ? 0.8 : 1;

    const stopLoss = DEFAULT_STOP_CONFIG.stopLossDistance * volatilityMultiplier;
    const takeProfit = DEFAULT_STOP_CONFIG.takeProfitDistance * volatilityMultiplier;

    return {
      stopLossDistance: Math.min(stopLoss, DEFAULT_STOP_CONFIG.maxStopLoss),
      takeProfitDistance: Math.max(takeProfit, DEFAULT_STOP_CONFIG.minTakeProfit),
    };
  }

  /**
   * 获取币种建议的杠杆
   */
  getRecommendedLeverage(coin: string): {
    min: number;
    max: number;
    recommended: number;
  } {
    const max = LEVERAGE_CONFIG[coin as keyof typeof LEVERAGE_CONFIG] || LEVERAGE_CONFIG.DEFAULT;

    // 推荐杠杆为最大的一半，但至少为2
    const recommended = Math.max(2, Math.floor(max / 2));

    return {
      min: 1,
      max,
      recommended,
    };
  }

  /**
   * 生成风险控制报告
   */
  generateReport(params: TradeParams): string {
    const result = this.validate(params);
    const leverageInfo = params.mode === TradingMode.PERPETUAL
      ? this.getRecommendedLeverage(params.coin)
      : null;

    let report = '\n=== 交易约束验证 ===\n';
    report += `币种: ${params.coin}\n`;
    report += `模式: ${params.mode === TradingMode.SPOT ? '现货' : '永续合约'}\n`;

    if (leverageInfo) {
      report += `杠杆: ${params.leverage || '未设置'}x (推荐: ${leverageInfo.recommended}x, 范围: ${leverageInfo.min}-${leverageInfo.max}x)\n`;
    }

    report += `止损: ${params.stopLossDistance ? (params.stopLossDistance * 100).toFixed(1) + '%' : '未设置'}\n`;
    report += `止盈: ${params.takeProfitDistance ? (params.takeProfitDistance * 100).toFixed(1) + '%' : '未设置'}\n`;

    report += `\n验证结果: ${result.allowed ? '✅ 通过' : '❌ 拒绝'}\n`;

    if (!result.allowed) {
      report += `\n原因: ${result.reason}\n`;
      if (result.suggestions) {
        report += `\n建议:\n`;
        result.suggestions.forEach(s => {
          report += `  - ${s}\n`;
        });
      }
    }

    return report;
  }
}

/**
 * 导出类型定义
 */
export type AllowedSpotCoin = typeof WHITELIST_CONFIG.spot[number];
export type AllowedPerpetualCoin = typeof WHITELIST_CONFIG.perpetual[number];
