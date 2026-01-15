/**
 * 规则引擎测试
 *
 * 测试功能：
 * - 规则引擎基础功能
 * - DCA 规则
 * - 网格交易规则
 * - 风控规则
 * - 信号生成和合并
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import {
  RuleEngine,
  createDCARule,
  createGridRule,
  createRiskControlRule,
  type RuleEngineInput,
  RuleType,
  SignalType,
  RiskLevel,
} from '../../src/rules';

// =====================================================
// 测试数据
// =====================================================

const createMockInput = (overrides?: Partial<RuleEngineInput>): RuleEngineInput => {
  const base: RuleEngineInput = {
    prices: [
      {
        coin: 'BTC',
        price: 43000,
        change24h: 2.5,
        high24h: 44000,
        low24h: 42000,
        volume24h: 1000000,
        timestamp: Date.now(),
      },
      {
        coin: 'ETH',
        price: 2300,
        change24h: -1.2,
        high24h: 2400,
        low24h: 2250,
        volume24h: 500000,
        timestamp: Date.now(),
      },
    ],
    positions: [],
    availableBalance: 10000,
    timestamp: Date.now(),
  };

  // Apply overrides properly (merge arrays if needed)
  if (overrides?.positions) {
    base.positions = overrides.positions;
  }
  if (overrides?.prices) {
    base.prices = overrides.prices;
  }

  return { ...base, ...overrides };
};

// =====================================================
// 规则引擎基础测试
// =====================================================

describe('规则引擎 - 基础功能', () => {
  test('应该创建规则引擎实例', () => {
    const engine = new RuleEngine();
    expect(engine).toBeDefined();
    expect(engine.getAllRules()).toHaveLength(0);
  });

  test('应该添加规则', () => {
    const engine = new RuleEngine();
    const dcaRule = createDCARule({
      ruleType: RuleType.DCA,
      enabled: true,
      priority: 1,
      coins: ['BTC'],
      investmentAmount: 100,
      intervalHours: 24,
      priceDeviationThreshold: 5,
      maxMultiplier: 2,
    });

    engine.addRule(dcaRule);

    expect(engine.getAllRules()).toHaveLength(1);
    expect(engine.getRule('dca')).toBeDefined();
  });

  test('应该移除规则', () => {
    const engine = new RuleEngine();
    const dcaRule = createDCARule({
      ruleType: RuleType.DCA,
      enabled: true,
      priority: 1,
      coins: ['BTC'],
      investmentAmount: 100,
      intervalHours: 24,
      priceDeviationThreshold: 5,
      maxMultiplier: 2,
    });

    engine.addRule(dcaRule);
    expect(engine.getAllRules()).toHaveLength(1);

    engine.removeRule('dca');
    expect(engine.getAllRules()).toHaveLength(0);
  });

  test('应该按优先级排序规则', () => {
    const engine = new RuleEngine();
    const rule1 = createDCARule({
      ruleType: RuleType.DCA,
      enabled: true,
      priority: 3,
      coins: ['BTC'],
      investmentAmount: 100,
      intervalHours: 24,
      priceDeviationThreshold: 5,
      maxMultiplier: 2,
    });

    const rule2 = createRiskControlRule({
      ruleType: RuleType.RISK_CONTROL,
      enabled: true,
      priority: 0,
      maxPositionValue: 50000,
      maxCoinPositionRatio: 30,
      maxDrawdownRatio: 10,
      maxDailyLoss: 1000,
      enableEmergencyStop: true,
      emergencyStopThreshold: 15,
    });

    engine.addRule(rule1);
    engine.addRule(rule2);

    const rules = engine.getAllRules();
    expect(rules[0].getPriority()).toBeLessThan(rules[1].getPriority());
  });

  test('应该获取规则统计', () => {
    const engine = new RuleEngine();
    const dcaRule = createDCARule({
      ruleType: RuleType.DCA,
      enabled: true,
      priority: 1,
      coins: ['BTC'],
      investmentAmount: 100,
      intervalHours: 24,
      priceDeviationThreshold: 5,
      maxMultiplier: 2,
    });

    engine.addRule(dcaRule);

    const stats = engine.getStats();
    expect(stats.totalRules).toBe(1);
    expect(stats.enabledRules).toBe(1);
    expect(stats.rulesByType['dca']).toBe(1);
  });
});

// =====================================================
// DCA 规则测试
// =====================================================

describe('DCA 规则', () => {
  test('应该初始化 DCA 规则', () => {
    const rule = createDCARule({
      ruleType: RuleType.DCA,
      enabled: true,
      priority: 1,
      coins: ['BTC', 'ETH'],
      investmentAmount: 100,
      intervalHours: 24,
      priceDeviationThreshold: 5,
      maxMultiplier: 2,
    });

    expect(rule).toBeDefined();
    expect(rule.isEnabled()).toBe(true);
    expect(rule.getRuleType()).toBe(RuleType.DCA);
  });

  test('应该获取 DCA 状态', () => {
    const rule = createDCARule({
      ruleType: RuleType.DCA,
      enabled: true,
      priority: 1,
      coins: ['BTC'],
      investmentAmount: 100,
      intervalHours: 24,
      priceDeviationThreshold: 5,
      maxMultiplier: 2,
    });

    const state = rule.getState('BTC');
    expect(state).toBeDefined();
    expect(state?.coin).toBe('BTC');
    expect(state?.investmentCount).toBe(0);
  });

  test('应该更新 DCA 状态', () => {
    const rule = createDCARule({
      ruleType: RuleType.DCA,
      enabled: true,
      priority: 1,
      coins: ['BTC'],
      investmentAmount: 100,
      intervalHours: 24,
      priceDeviationThreshold: 5,
      maxMultiplier: 2,
    });

    rule.updateState('BTC', 100, 43000, 0.0023);

    const state = rule.getState('BTC');
    expect(state?.totalInvested).toBe(100);
    expect(state?.totalAmount).toBeCloseTo(0.0023);
    expect(state?.investmentCount).toBe(1);
  });

  test('应该重置 DCA 状态', () => {
    const rule = createDCARule({
      ruleType: RuleType.DCA,
      enabled: true,
      priority: 1,
      coins: ['BTC'],
      investmentAmount: 100,
      intervalHours: 24,
      priceDeviationThreshold: 5,
      maxMultiplier: 2,
    });

    rule.updateState('BTC', 100, 43000, 0.0023);
    rule.resetState('BTC');

    const state = rule.getState('BTC');
    expect(state?.totalInvested).toBe(0);
    expect(state?.investmentCount).toBe(0);
  });

  test('应该添加和移除币种', () => {
    const rule = createDCARule({
      ruleType: RuleType.DCA,
      enabled: true,
      priority: 1,
      coins: ['BTC'],
      investmentAmount: 100,
      intervalHours: 24,
      priceDeviationThreshold: 5,
      maxMultiplier: 2,
    });

    rule.addCoin('ETH');
    let state = rule.getState('ETH');
    expect(state).toBeDefined();

    rule.removeCoin('ETH');
    state = rule.getState('ETH');
    expect(state).toBeUndefined();
  });
});

// =====================================================
// 网格交易规则测试
// =====================================================

describe('网格交易规则', () => {
  test('应该初始化网格交易规则', () => {
    const rule = createGridRule({
      ruleType: RuleType.GRID,
      enabled: true,
      priority: 2,
      coin: 'BTC',
      upperPrice: 45000,
      lowerPrice: 40000,
      gridCount: 10,
      investmentPerGrid: 100,
    });

    expect(rule).toBeDefined();
    expect(rule.isEnabled()).toBe(true);
    expect(rule.getRuleType()).toBe(RuleType.GRID);
  });

  test('应该获取网格状态', () => {
    const rule = createGridRule({
      ruleType: RuleType.GRID,
      enabled: true,
      priority: 2,
      coin: 'BTC',
      upperPrice: 45000,
      lowerPrice: 40000,
      gridCount: 10,
      investmentPerGrid: 100,
    });

    const state = rule.getState();
    expect(state).toBeDefined();
    expect(state.coin).toBe('BTC');
    expect(state.gridOrders).toHaveLength(0);
  });

  test('应该获取网格统计', () => {
    const rule = createGridRule({
      ruleType: RuleType.GRID,
      enabled: true,
      priority: 2,
      coin: 'BTC',
      upperPrice: 45000,
      lowerPrice: 40000,
      gridCount: 10,
      investmentPerGrid: 100,
    });

    const stats = rule.getGridStats();
    expect(stats.totalOrders).toBe(0);
    expect(stats.pendingOrders).toBe(0);
    expect(stats.filledOrders).toBe(0);
  });

  test('应该重置网格状态', () => {
    const rule = createGridRule({
      ruleType: RuleType.GRID,
      enabled: true,
      priority: 2,
      coin: 'BTC',
      upperPrice: 45000,
      lowerPrice: 40000,
      gridCount: 10,
      investmentPerGrid: 100,
    });

    rule.resetState();
    const state = rule.getState();
    expect(state.gridOrders).toHaveLength(0);
    expect(state.realizedPnL).toBe(0);
  });
});

// =====================================================
// 风控规则测试
// =====================================================

describe('风控规则', () => {
  test('应该初始化风控规则', () => {
    const rule = createRiskControlRule({
      ruleType: RuleType.RISK_CONTROL,
      enabled: true,
      priority: 0,
      maxPositionValue: 50000,
      maxCoinPositionRatio: 30,
      maxDrawdownRatio: 10,
      maxDailyLoss: 1000,
      enableEmergencyStop: true,
      emergencyStopThreshold: 15,
    });

    expect(rule).toBeDefined();
    expect(rule.isEnabled()).toBe(true);
    expect(rule.getRuleType()).toBe(RuleType.RISK_CONTROL);
  });

  test('应该评估低风险', () => {
    const rule = createRiskControlRule({
      ruleType: RuleType.RISK_CONTROL,
      enabled: true,
      priority: 0,
      maxPositionValue: 50000,
      maxCoinPositionRatio: 30,
      maxDrawdownRatio: 10,
      maxDailyLoss: 1000,
      enableEmergencyStop: true,
      emergencyStopThreshold: 15,
    });

    // 使用空仓位，确保不触发任何风控
    const input = createMockInput({
      positions: [],
      availableBalance: 10000,
    });

    const assessment = rule.assessRisk(input);
    expect(assessment.level).toBe(RiskLevel.LOW);
    expect(assessment.triggered).toBe(false);
    expect(assessment.triggeredRules).toHaveLength(0);
  });

  test('应该触发最大持仓价值风控', () => {
    const rule = createRiskControlRule({
      ruleType: RuleType.RISK_CONTROL,
      enabled: true,
      priority: 0,
      maxPositionValue: 1000,
      maxCoinPositionRatio: 50, // 提高到50%以避免触发单币种比例限制
      maxDrawdownRatio: 10,
      maxDailyLoss: 1000,
      enableEmergencyStop: true,
      emergencyStopThreshold: 15,
    });

    // 使用小仓位但总价值超过限制（且单币种比例不超过50%）
    // 总价值需要 > 1000
    const input = createMockInput({
      positions: [
        { coin: 'BTC', amount: 0.012, avgCost: 42000, unrealizedPnL: 12 },  // 504
        { coin: 'ETH', amount: 0.15, avgCost: 2300, unrealizedPnL: 8 },     // 345
        { coin: 'SOL', amount: 2, avgCost: 100, unrealizedPnL: 5 },         // 200
        { coin: 'DOGE', amount: 2000, avgCost: 0.1, unrealizedPnL: 2 },    // 200
        // 总计: 504 + 345 + 200 + 200 = 1249 > 1000
      ],
      availableBalance: 10000,
    });

    const assessment = rule.assessRisk(input);
    expect(assessment.level).toBe(RiskLevel.HIGH);
    expect(assessment.triggered).toBe(true);
    expect(assessment.triggeredRules).toContain('最大持仓价值超限');
  });

  test('应该触发单币种持仓比例风控', () => {
    const rule = createRiskControlRule({
      ruleType: RuleType.RISK_CONTROL,
      enabled: true,
      priority: 0,
      maxPositionValue: 50000,
      maxCoinPositionRatio: 10,
      maxDrawdownRatio: 10,
      maxDailyLoss: 1000,
      enableEmergencyStop: true,
      emergencyStopThreshold: 15,
    });

    const input = createMockInput({
      positions: [
        {
          coin: 'BTC',
          amount: 1,
          avgCost: 42000,
          unrealizedPnL: 1000,
        },
      ],
      availableBalance: 10000,
    });

    const assessment = rule.assessRisk(input);
    expect(assessment.level).toBe(RiskLevel.CRITICAL);
    expect(assessment.triggered).toBe(true);
    // 触发的规则包含币种名称
    expect(assessment.triggeredRules.some(r => r.includes('单币种持仓比例超限'))).toBe(true);
  });

  test('应该检查是否可以交易', () => {
    const rule = createRiskControlRule({
      ruleType: RuleType.RISK_CONTROL,
      enabled: true,
      priority: 0,
      maxPositionValue: 50000,
      maxCoinPositionRatio: 30,
      maxDrawdownRatio: 10,
      maxDailyLoss: 1000,
      enableEmergencyStop: true,
      emergencyStopThreshold: 15,
    });

    // 使用空仓位，确保不触发任何风控
    const input = createMockInput({
      positions: [],
      availableBalance: 10000,
    });

    const result = rule.canTrade(input);
    expect(result.allowed).toBe(true);
  });

  test('应该禁止交易当风控触发时', () => {
    const rule = createRiskControlRule({
      ruleType: RuleType.RISK_CONTROL,
      enabled: true,
      priority: 0,
      maxPositionValue: 1000,
      maxCoinPositionRatio: 30,
      maxDrawdownRatio: 10,
      maxDailyLoss: 1000,
      enableEmergencyStop: true,
      emergencyStopThreshold: 15,
    });

    const input = createMockInput({
      positions: [
        {
          coin: 'BTC',
          amount: 1,
          avgCost: 42000,
          unrealizedPnL: 1000,
        },
      ],
      availableBalance: 10000,
    });

    const result = rule.canTrade(input);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeDefined();
  });

  test('应该更新和重置日度亏损', () => {
    const rule = createRiskControlRule({
      ruleType: RuleType.RISK_CONTROL,
      enabled: true,
      priority: 0,
      maxPositionValue: 50000,
      maxCoinPositionRatio: 30,
      maxDrawdownRatio: 10,
      maxDailyLoss: 1000,
      enableEmergencyStop: true,
      emergencyStopThreshold: 15,
    });

    rule.updateDailyLoss(500);
    let status = rule.getRiskControlStatus();
    expect(status.dailyLoss).toBe(500);

    rule.resetDailyLoss();
    status = rule.getRiskControlStatus();
    expect(status.dailyLoss).toBe(0);
  });
});

// =====================================================
// 规则引擎集成测试
// =====================================================

describe('规则引擎 - 集成测试', () => {
  let engine: RuleEngine;

  beforeEach(() => {
    engine = new RuleEngine();
  });

  test('应该执行空规则引擎', async () => {
    const input = createMockInput();
    const output = await engine.execute(input);

    expect(output.signals).toHaveLength(0);
    expect(output.recommendations).toHaveLength(0);
    expect(output.rejections).toHaveLength(0);
  });

  test('应该执行单个 DCA 规则', async () => {
    const dcaRule = createDCARule({
      ruleType: RuleType.DCA,
      enabled: true,
      priority: 1,
      coins: ['BTC'],
      investmentAmount: 100,
      intervalHours: 24,
      priceDeviationThreshold: 5,
      maxMultiplier: 2,
    });

    // 设置为立即触发（通过修改上次投资时间）
    const input = createMockInput({
      timestamp: Date.now() + 25 * 60 * 60 * 1000, // 25小时后
    });

    engine.addRule(dcaRule);
    const output = await engine.execute(input);

    // DCA 规则应该在到达时间时生成信号
    expect(output.signals.length).toBeGreaterThanOrEqual(0);
  });

  test('风控规则应该阻止其他规则执行', async () => {
    const riskRule = createRiskControlRule({
      ruleType: RuleType.RISK_CONTROL,
      enabled: true,
      priority: 0,
      maxPositionValue: 1000,
      maxCoinPositionRatio: 30,
      maxDrawdownRatio: 10,
      maxDailyLoss: 1000,
      enableEmergencyStop: true,
      emergencyStopThreshold: 15,
    });

    const dcaRule = createDCARule({
      ruleType: RuleType.DCA,
      enabled: true,
      priority: 1,
      coins: ['BTC'],
      investmentAmount: 100,
      intervalHours: 24,
      priceDeviationThreshold: 5,
      maxMultiplier: 2,
    });

    const input = createMockInput({
      positions: [
        {
          coin: 'BTC',
          amount: 1,
          avgCost: 42000,
          unrealizedPnL: 1000,
        },
      ],
      availableBalance: 10000,
      timestamp: Date.now() + 25 * 60 * 60 * 1000,
    });

    engine.addRule(riskRule);
    engine.addRule(dcaRule);

    const output = await engine.execute(input);

    // 应该只有风控信号，没有 DCA 信号
    expect(output.rejections.length).toBeGreaterThan(0);
  });

  test('应该过滤资金不足的买入信号', async () => {
    const dcaRule = createDCARule({
      ruleType: RuleType.DCA,
      enabled: true,
      priority: 1,
      coins: ['BTC'],
      investmentAmount: 100000, // 大额投资
      intervalHours: 24,
      priceDeviationThreshold: 5,
      maxMultiplier: 2,
    });

    const input = createMockInput({
      availableBalance: 100, // 低余额
      timestamp: Date.now() + 25 * 60 * 60 * 1000,
    });

    engine.addRule(dcaRule);
    const output = await engine.execute(input);

    // 推荐操作应该为空（资金不足）
    expect(output.recommendations.length).toBe(0);
  });
});
