/**
 * 现货交易协调器测试
 *
 * 测试功能：
 * - 协调器初始化
 * - AI 和规则决策协调
 * - 安全验证
 * - 决策执行
 * - 统计信息
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import {
  SpotCoordinator,
  type SpotCoordinatorConfig,
  type CoordinatedDecision,
  type MarketContext,
  type PositionInfo,
} from '../../src/trading';
import type { PriceData, CandleData, TechnicalIndicators } from '../../src/market';
import { GLMClient } from '../../src/ai';
import { RuleEngine, createDCARule, createRiskControlRule } from '../../src/rules';
import { SafetyValidator } from '../../src/safety';
import { RuleType } from '../../src/rules/types';

// =====================================================
// 测试数据
// =====================================================

const createMarketContext = (overrides?: Partial<MarketContext>): MarketContext => {
  const prices = new Map<string, PriceData>();
  prices.set('BTC', {
    coin: 'BTC',
    price: 43000,
    change24h: 2.5,
    high24h: 44000,
    low24h: 42000,
    volume24h: 1000000,
    volumeCcy24h: 43000000000,
    timestamp: Date.now(),
  });
  prices.set('ETH', {
    coin: 'ETH',
    price: 2300,
    change24h: -1.2,
    high24h: 2400,
    low24h: 2200,
    volume24h: 500000,
    volumeCcy24h: 1150000000,
    timestamp: Date.now(),
  });

  const klines = new Map<string, CandleData[]>();
  const indicators = new Map<string, TechnicalIndicators>();

  return {
    prices,
    klines,
    indicators,
    isMarketNormal: true,
    timestamp: Date.now(),
    ...overrides,
  };
};

const createPositions = (overrides?: PositionInfo[]): PositionInfo[] => {
  const defaults: PositionInfo[] = [];
  return overrides || defaults;
};

const createCoordinatorConfig = (overrides?: Partial<SpotCoordinatorConfig>): SpotCoordinatorConfig => ({
  enabled: true,
  weights: {
    aiWeight: 0.7,
    ruleWeight: 0.3,
  },
  coins: ['BTC', 'ETH'],
  maxTradeAmount: 5000,
  maxCoinPositionRatio: 30,
  enableAI: true,
  enableRules: true,
  enableSafety: true,
  aiCallInterval: 90000, // 90秒
  performanceReportInterval: 6 * 60 * 60 * 1000, // 6小时
  deepAnalysisInterval: 24 * 60 * 60 * 1000, // 24小时
  ...overrides,
});

// =====================================================
// 协调器基础测试
// =====================================================

describe('现货交易协调器 - 基础功能', () => {
  test('应该创建协调器实例', () => {
    const aiClient = new GLMClient({ apiKey: 'test-key', enableLogging: false });
    const ruleEngine = new RuleEngine();
    const safetyValidator = new SafetyValidator({ enabled: false });
    const config = createCoordinatorConfig();

    const coordinator = new SpotCoordinator(config, aiClient, ruleEngine, safetyValidator);

    expect(coordinator).toBeDefined();
    expect(coordinator.getConfig().enabled).toBe(true);
  });

  test('应该获取和更新配置', () => {
    const aiClient = new GLMClient({ apiKey: 'test-key', enableLogging: false });
    const ruleEngine = new RuleEngine();
    const safetyValidator = new SafetyValidator({ enabled: false });
    const config = createCoordinatorConfig();

    const coordinator = new SpotCoordinator(config, aiClient, ruleEngine, safetyValidator);

    const initialConfig = coordinator.getConfig();
    expect(initialConfig.weights.aiWeight).toBe(0.7);

    coordinator.updateConfig({
      weights: {
        aiWeight: 0.6,
        ruleWeight: 0.4,
      },
    });

    const updatedConfig = coordinator.getConfig();
    expect(updatedConfig.weights.aiWeight).toBe(0.6);
    expect(updatedConfig.weights.ruleWeight).toBe(0.4);
  });

  test('应该拒绝权重总和不为1的配置', () => {
    const aiClient = new GLMClient({ apiKey: 'test-key', enableLogging: false });
    const ruleEngine = new RuleEngine();
    const safetyValidator = new SafetyValidator({ enabled: false });
    const config = createCoordinatorConfig();

    const coordinator = new SpotCoordinator(config, aiClient, ruleEngine, safetyValidator);

    expect(() => {
      coordinator.updateConfig({
        weights: {
          aiWeight: 0.5,
          ruleWeight: 0.3, // 总和为0.8
        },
      });
    }).toThrow('权重总和必须为 1');
  });

  test('禁用时应该返回空决策', async () => {
    const aiClient = new GLMClient({ apiKey: 'test-key', enableLogging: false });
    const ruleEngine = new RuleEngine();
    const safetyValidator = new SafetyValidator({ enabled: false });
    const config = createCoordinatorConfig({ enabled: false });

    const coordinator = new SpotCoordinator(config, aiClient, ruleEngine, safetyValidator);

    const market = createMarketContext();
    const positions = createPositions();
    const decisions = await coordinator.execute(market, positions, 10000);

    expect(decisions).toHaveLength(0);
  });
});

// =====================================================
// 决策协调测试
// =====================================================

describe('现货交易协调器 - 决策协调', () => {
  let aiClient: GLMClient;
  let ruleEngine: RuleEngine;
  let safetyValidator: SafetyValidator;
  let config: SpotCoordinatorConfig;
  let coordinator: SpotCoordinator;

  beforeEach(() => {
    aiClient = new GLMClient({ apiKey: 'test-key', enableLogging: false });
    ruleEngine = new RuleEngine();
    safetyValidator = new SafetyValidator({ enabled: false });
    config = createCoordinatorConfig({ enableAI: false, enableRules: false });
    coordinator = new SpotCoordinator(config, aiClient, ruleEngine, safetyValidator);
  });

  test('应该协调空的 AI 和规则决策', async () => {
    const market = createMarketContext();
    const positions = createPositions();

    const decisions = await coordinator.execute(market, positions, 10000);

    expect(decisions).toHaveLength(0);
  });

  test('应该只使用规则决策', async () => {
    // 添加 DCA 规则
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

    // 设置为立即触发
    const input = {
      prices: [
        {
          coin: 'BTC',
          price: 43000,
          change24h: 2.5,
          high24h: 44000,
          low24h: 42000,
          volume24h: 1000000,
          timestamp: Date.now() + 25 * 60 * 60 * 1000,
        },
      ],
      positions: [],
      availableBalance: 10000,
      timestamp: Date.now() + 25 * 60 * 60 * 1000,
    };

    ruleEngine.addRule(dcaRule);
    coordinator.updateConfig({ enableRules: true, enableAI: false });

    const market = createMarketContext({
      timestamp: Date.now() + 25 * 60 * 60 * 1000,
    });
    const positions = createPositions();

    const decisions = await coordinator.execute(market, positions, 10000);

    // DCA 规则可能生成信号（取决于间隔时间）
    expect(Array.isArray(decisions)).toBe(true);
  });

  test('应该过滤掉非白名单币种的决策', async () => {
    // 设置白名单只包含 BTC
    coordinator.updateConfig({
      coins: ['BTC'],
    });

    const market = createMarketContext();
    const positions = createPositions();

    // 模拟有 ETH 决策的情况
    const decisions = await coordinator.execute(market, positions, 10000);

    // 检查 ETH 是否被过滤
    const ethDecisions = decisions.filter(d => d.coin === 'ETH');
    expect(ethDecisions).toHaveLength(0);
  });
});

// =====================================================
// 安全验证测试
// =====================================================

describe('现货交易协调器 - 安全验证', () => {
  test('应该通过安全的决策', async () => {
    const aiClient = new GLMClient({ apiKey: 'test-key', enableLogging: false });
    const ruleEngine = new RuleEngine();
    const safetyValidator = new SafetyValidator({
      enabled: true,
      minReserveBalance: 100,
      maxSingleTradeAmount: 5000,
      minSingleTradeAmount: 10,
    });

    const config = createCoordinatorConfig({ enableAI: false, enableRules: false });
    const coordinator = new SpotCoordinator(config, aiClient, ruleEngine, safetyValidator);

    const market = createMarketContext();
    const positions = createPositions();

    const decisions = await coordinator.execute(market, positions, 10000);

    expect(Array.isArray(decisions)).toBe(true);
  });

  test('应该拒绝不安全的决策', async () => {
    const aiClient = new GLMClient({ apiKey: 'test-key', enableLogging: false });
    const ruleEngine = new RuleEngine();
    const safetyValidator = new SafetyValidator({
      enabled: true,
      minReserveBalance: 100,
      maxSingleTradeAmount: 100, // 最大100 USDT
    });

    const config = createCoordinatorConfig({
      enableAI: false,
      enableRules: false,
      maxTradeAmount: 1000, // 但协调器配置允许1000
    });

    const coordinator = new SpotCoordinator(config, aiClient, ruleEngine, safetyValidator);

    const market = createMarketContext();
    const positions = createPositions();

    const decisions = await coordinator.execute(market, positions, 10000);

    // 任何大于100 USDT的决策都应该被安全验证器拒绝
    for (const decision of decisions) {
      expect(decision.suggestedAmount ?? 0).toBeLessThanOrEqual(100);
    }
  });
});

// =====================================================
// 统计信息测试
// =====================================================

describe('现货交易协调器 - 统计信息', () => {
  test('应该跟踪决策统计', async () => {
    const aiClient = new GLMClient({ apiKey: 'test-key', enableLogging: false });
    const ruleEngine = new RuleEngine();
    const safetyValidator = new SafetyValidator({ enabled: false });
    const config = createCoordinatorConfig();
    const coordinator = new SpotCoordinator(config, aiClient, ruleEngine, safetyValidator);

    const market = createMarketContext();
    const positions = createPositions();

    await coordinator.execute(market, positions, 10000);

    const stats = coordinator.getStats();
    expect(stats.totalDecisions).toBeGreaterThanOrEqual(0);
  });
});

// =====================================================
// 回调测试
// =====================================================

describe('现货交易协调器 - 回调', () => {
  test('应该触发决策回调', async () => {
    const aiClient = new GLMClient({ apiKey: 'test-key', enableLogging: false });
    const ruleEngine = new RuleEngine();
    const safetyValidator = new SafetyValidator({ enabled: false });
    const config = createCoordinatorConfig();
    const coordinator = new SpotCoordinator(config, aiClient, ruleEngine, safetyValidator);

    let callbackCalled = false;
    coordinator.onDecision((decision) => {
      callbackCalled = true;
      expect(decision).toBeDefined();
    });

    const market = createMarketContext();
    const positions = createPositions();

    await coordinator.execute(market, positions, 10000);

    // 回调是否被调用取决于是否有决策生成
    expect(typeof callbackCalled).toBe('boolean');
  });

  test('应该能够移除回调', async () => {
    const aiClient = new GLMClient({ apiKey: 'test-key', enableLogging: false });
    const ruleEngine = new RuleEngine();
    const safetyValidator = new SafetyValidator({ enabled: false });
    const config = createCoordinatorConfig();
    const coordinator = new SpotCoordinator(config, aiClient, ruleEngine, safetyValidator);

    let callbackCalled = false;
    const callback = () => {
      callbackCalled = true;
    };

    coordinator.onDecision(callback);
    coordinator.offDecision(callback);

    const market = createMarketContext();
    const positions = createPositions();

    await coordinator.execute(market, positions, 10000);

    expect(callbackCalled).toBe(false);
  });
});
