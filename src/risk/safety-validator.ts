/**
 * 安全策略验证和测试
 *
 * 验证所有安全策略逻辑是否正确工作
 */

import type { SignalFilterConfig, RiskLimitsConfig, StopLossConfig } from './safety-config';

// =====================================================
// 测试数据
// =====================================================

/**
 * 模拟技术信号
 */
export interface MockSignal {
  id: string;
  type: string;
  direction: 'bullish' | 'bearish';
  coin: string;
  timeframe: string;
  strength: number;           // 0-1
  confidence: number;         // 0-1
  price: number;
  timestamp: number;
}

/**
 * 模拟实时风险指标
 */
export interface MockRiskMetrics {
  marketRisk: {
    liquidity: 'sufficient' | 'tight' | 'dry';
    volatility: 'low' | 'normal' | 'high' | 'extreme';
  };
  tradeRisk: {
    expectedSlippage: number;  // 0-1
  };
  systemRisk: {
    apiLatency: number;        // 毫秒
    websocketConnected: boolean;
  };
}

/**
 * 模拟微观结构指标
 */
export interface MockMicrostructureIndicators {
  orderFlowImbalance: number;
  priceMomentum1m: number;
  compositeStrength: number;   // 0-100
}

// =====================================================
// 安全策略验证器
// =====================================================

export class SafetyPolicyValidator {
  private signalFilter: SignalFilterConfig;
  private riskLimits: RiskLimitsConfig;

  constructor(
    signalFilter: SignalFilterConfig,
    riskLimits: RiskLimitsConfig
  ) {
    this.signalFilter = signalFilter;
    this.riskLimits = riskLimits;
  }

  /**
   * 验证信号过滤逻辑
   */
  validateSignalFilter(signal: MockSignal): {
    passed: boolean;
    reason: string;
    checks: { name: string; passed: boolean; value: any; threshold: any }[];
  } {
    const checks: any[] = [];

    // 1. 信号强度检查
    checks.push({
      name: '信号强度',
      passed: signal.strength >= this.signalFilter.minStrength,
      value: signal.strength,
      threshold: `>= ${this.signalFilter.minStrength}`,
    });

    // 2. 信号置信度检查
    checks.push({
      name: '信号置信度',
      passed: signal.confidence >= this.signalFilter.minConfidence,
      value: signal.confidence,
      threshold: `>= ${this.signalFilter.minConfidence}`,
    });

    const passed = checks.every(c => c.passed);

    return {
      passed,
      reason: passed ? '通过所有过滤检查' : `未通过: ${checks.filter(c => !c.passed).map(c => c.name).join(', ')}`,
      checks,
    };
  }

  /**
   * 验证风险限制逻辑
   */
  validateRiskLimits(
    signal: MockSignal,
    riskMetrics: MockRiskMetrics,
    currentExposure: number,
    openPositionsCount: number,
    consecutiveLosses: number,
    dailyLoss: number
  ): {
    passed: boolean;
    reason: string;
    checks: { name: string; passed: boolean; value: any; threshold: any }[];
  } {
    const checks: any[] = [];

    // 1. 流动性检查
    const liquidityPassed = riskMetrics.marketRisk.liquidity !== 'dry';
    checks.push({
      name: '市场流动性',
      passed: liquidityPassed,
      value: riskMetrics.marketRisk.liquidity,
      threshold: '!= dry',
    });

    // 2. 波动率检查
    const volatilityPassed = riskMetrics.marketRisk.volatility !== 'extreme';
    checks.push({
      name: '市场波动率',
      passed: volatilityPassed,
      value: riskMetrics.marketRisk.volatility,
      threshold: '!= extreme',
    });

    // 3. 风险敞口检查
    checks.push({
      name: '风险敞口',
      passed: currentExposure <= this.riskLimits.maxExposure,
      value: `${currentExposure.toFixed(1)}%`,
      threshold: `<= ${this.riskLimits.maxExposure}%`,
    });

    // 4. 持仓数量检查
    checks.push({
      name: '持仓数量',
      passed: openPositionsCount < this.riskLimits.maxPositions,
      value: openPositionsCount,
      threshold: `< ${this.riskLimits.maxPositions}`,
    });

    // 5. 连续亏损检查
    checks.push({
      name: '连续亏损',
      passed: consecutiveLosses < this.riskLimits.consecutiveLossLimit,
      value: consecutiveLosses,
      threshold: `< ${this.riskLimits.consecutiveLossLimit}`,
    });

    // 6. 每日亏损检查
    checks.push({
      name: '每日亏损',
      passed: dailyLoss < this.riskLimits.dailyLossLimit,
      value: `${dailyLoss.toFixed(1)}%`,
      threshold: `< ${this.riskLimits.dailyLossLimit}%`,
    });

    // 7. API延迟检查
    checks.push({
      name: 'API延迟',
      passed: riskMetrics.systemRisk.apiLatency < this.riskLimits.maxApiLatency,
      value: `${riskMetrics.systemRisk.apiLatency}ms`,
      threshold: `< ${this.riskLimits.maxApiLatency}ms`,
    });

    // 8. WebSocket连接检查
    checks.push({
      name: 'WebSocket连接',
      passed: riskMetrics.systemRisk.websocketConnected,
      value: riskMetrics.systemRisk.websocketConnected,
      threshold: 'true',
    });

    // 9. 滑点检查
    const slippagePercent = riskMetrics.tradeRisk.expectedSlippage * 100;
    checks.push({
      name: '预期滑点',
      passed: riskMetrics.tradeRisk.expectedSlippage <= this.riskLimits.maxSlippage,
      value: `${slippagePercent.toFixed(3)}%`,
      threshold: `<= ${this.riskLimits.maxSlippage * 100}%`,
    });

    const passed = checks.every(c => c.passed);

    return {
      passed,
      reason: passed ? '通过所有风险检查' : `未通过: ${checks.filter(c => !c.passed).map(c => c.name).join(', ')}`,
      checks,
    };
  }

  /**
   * 验证止盈止损计算
   */
  validateStopLoss(
    direction: 'bullish' | 'bearish',
    entryPrice: number,
    stopLoss: number,
    takeProfit: number
  ): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    // 1. 止损价格合理性
    if (direction === 'bullish') {
      if (stopLoss >= entryPrice) {
        errors.push(`多头止损价 ${stopLoss} 必须低于入场价 ${entryPrice}`);
      }
      if (takeProfit <= entryPrice) {
        errors.push(`多头止盈价 ${takeProfit} 必须高于入场价 ${entryPrice}`);
      }
    } else {
      if (stopLoss <= entryPrice) {
        errors.push(`空头止损价 ${stopLoss} 必须高于入场价 ${entryPrice}`);
      }
      if (takeProfit >= entryPrice) {
        errors.push(`空头止盈价 ${takeProfit} 必须低于入场价 ${entryPrice}`);
      }
    }

    // 2. 止盈止损区间合理性
    const slPercent = Math.abs((stopLoss - entryPrice) / entryPrice);
    const tpPercent = Math.abs((takeProfit - entryPrice) / entryPrice);

    if (slPercent < 0.0001 || tpPercent < 0.0001) {
      errors.push(`止盈止损区间过小: SL=${slPercent.toFixed(4)}, TP=${tpPercent.toFixed(4)}`);
    }

    if (slPercent > 0.01 || tpPercent > 0.01) {
      errors.push(`止盈止损区间过大(高频交易): SL=${slPercent.toFixed(4)}, TP=${tpPercent.toFixed(4)}`);
    }

    // 3. 风险回报比
    const riskRewardRatio = tpPercent / slPercent;
    if (riskRewardRatio < 1.2) {
      errors.push(`风险回报比过低: ${riskRewardRatio.toFixed(2)} < 1.2`);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * 计算动态仓位大小
   */
  calculatePositionSize(
    signal: MockSignal,
    currentExposure: number,
    consecutiveLosses: number,
    marketCondition: { volatility: string },
    totalCapital: number
  ): {
    positionSize: number;
    reasoning: string[];
  } {
    const reasoning: string[] = [];
    let multiplier = 1.0;

    // 基础仓位
    const basePositionSize = totalCapital * 0.05; // 5%
    reasoning.push(`基础仓位: 5% = ${basePositionSize} USDT`);

    // 1. 信号强度调整
    if (signal.strength < 0.5) {
      multiplier *= 0.5;
      reasoning.push(`低强度(${signal.strength.toFixed(2)}) → 仓位 × 0.5`);
    } else if (signal.strength > 0.7) {
      multiplier *= 1.5;
      reasoning.push(`高强度(${signal.strength.toFixed(2)}) → 仓位 × 1.5`);
    }

    // 2. 连续亏损调整
    if (consecutiveLosses >= 2) {
      multiplier *= 0.5;
      reasoning.push(`连续${consecutiveLosses}次亏损 → 仓位 × 0.5`);
    }

    // 3. 市场波动率调整
    if (marketCondition.volatility === 'high') {
      multiplier *= 0.5;
      reasoning.push(`高波动率 → 仓位 × 0.5`);
    }

    // 4. 风险敞口调整
    const remainingExposure = this.riskLimits.maxExposure - currentExposure;
    const maxPositionRatio = remainingExposure / 100;
    if (multiplier > maxPositionRatio && maxPositionRatio > 0) {
      multiplier = maxPositionRatio;
      reasoning.push(`风险敞口限制 → 仓位调整至 ${maxPositionRatio.toFixed(2)}倍`);
    }

    const positionSize = basePositionSize * multiplier;
    reasoning.push(`最终仓位: ${positionSize.toFixed(2)} USDT (${(multiplier * 100).toFixed(0)}% 基础仓位)`);

    return {
      positionSize,
      reasoning,
    };
  }

  /**
   * 检查持仓时间限制
   */
  validateHoldingTime(entryTime: number, timeframe: string): {
    shouldClose: boolean;
    reason: string;
    holdingTime: number;
    maxTime: number;
  } {
    const maxTimes: Record<string, number> = {
      '1m': 60 * 1000,
      '3m': 3 * 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1H': 60 * 60 * 1000,
      '2H': 2 * 60 * 60 * 1000,
      '4H': 4 * 60 * 60 * 1000,
      '6H': 6 * 60 * 60 * 1000,
      '12H': 12 * 60 * 60 * 1000,
      '1D': 24 * 60 * 60 * 1000,
      '1W': 7 * 24 * 60 * 60 * 1000,
    };

    const maxTime = maxTimes[timeframe] || 5 * 60 * 1000;
    const holdingTime = Date.now() - entryTime;

    return {
      shouldClose: holdingTime > maxTime,
      reason: holdingTime > maxTime
        ? `超过最大持仓时间 (${(holdingTime / 1000).toFixed(0)}秒 > ${(maxTime / 1000).toFixed(0)}秒)`
        : '正常',
      holdingTime,
      maxTime,
    };
  }
}

// =====================================================
// 示例：完整的安全策略验证流程
// =====================================================

export function runSafetyPolicyValidationExample(): void {
  console.log('='.repeat(60));
  console.log('安全策略验证示例');
  console.log('='.repeat(60));

  // 创建验证器
  const validator = new SafetyPolicyValidator(
    {
      minStrength: 0.5,
      minConfidence: 0.5,
      enableADXFilter: true,
      minADX: 20,
      enablePriceConfirmation: true,
      priceConfirmationBars: 2,
      enableVolumeConfirmation: true,
      minVolumeRatio: 1.2,
      enableMicrostructure: true,
      minMicrostructureStrength: 50,
    },
    {
      maxPositions: 3,
      maxExposure: 30,
      maxPositionSize: 10,
      consecutiveLossLimit: 3,
      dailyLossLimit: 5,
      maxDrawdownLimit: 15,
      maxSlippage: 0.05,
      minLiquidity: 50000,
      maxApiLatency: 500,
      maxWebSocketLatency: 3000,
    }
  );

  // 示例1: 正常信号
  const normalSignal: MockSignal = {
    id: 'test1',
    type: 'MA_CROSS',
    direction: 'bullish',
    coin: 'BTC',
    timeframe: '15m',
    strength: 0.75,
    confidence: 0.8,
    price: 50000,
    timestamp: Date.now(),
  };

  const normalRiskMetrics: MockRiskMetrics = {
    marketRisk: { liquidity: 'sufficient', volatility: 'normal' },
    tradeRisk: { expectedSlippage: 0.0003 },
    systemRisk: { apiLatency: 100, websocketConnected: true },
  };

  console.log('\n【示例1: 正常交易信号】');
  console.log('信号:', normalSignal);

  const signalValidation = validator.validateSignalFilter(normalSignal);
  console.log('信号过滤结果:', signalValidation);

  const riskValidation = validator.validateRiskLimits(
    normalSignal,
    normalRiskMetrics,
    10, // 当前敞口 10%
    1,  // 持仓数量 1
    0,  // 连续亏损 0
    2   // 每日亏损 2%
  );
  console.log('风险限制结果:', riskValidation);

  const positionSize = validator.calculatePositionSize(
    normalSignal,
    10,
    0,
    { volatility: 'normal' },
    10000
  );
  console.log('仓位大小:', positionSize);

  // 止盈止损验证
  const stopLossValidation = validator.validateStopLoss(
    'bullish',
    50000,
    50000 * 0.998,  // 0.2% 止损
    50000 * 1.003   // 0.3% 止盈
  );
  console.log('止盈止损验证:', stopLossValidation);

  // 示例2: 边界情况
  console.log('\n' + '='.repeat(60));
  console.log('【示例2: 边界情况测试】');

  // 测试低强度信号
  const lowStrengthSignal = { ...normalSignal, strength: 0.3, confidence: 0.4 };
  const lowStrengthResult = validator.validateSignalFilter(lowStrengthSignal);
  console.log('低强度信号过滤:', lowStrengthResult);

  // 测试极端波动率
  const extremeVolatilityRisk: MockRiskMetrics = {
    ...normalRiskMetrics,
    marketRisk: { liquidity: 'sufficient' as const, volatility: 'extreme' as const }
  };
  const extremeVolatilityResult = validator.validateRiskLimits(
    normalSignal,
    extremeVolatilityRisk,
    10, 1, 0, 2
  );
  console.log('极端波动率过滤:', extremeVolatilityResult);

  console.log('\n' + '='.repeat(60));
  console.log('安全策略验证完成');
  console.log('='.repeat(60));
}

// 如果直接运行此文件，执行验证
if (import.meta.main) {
  runSafetyPolicyValidationExample();
}
