/**
 * 交易历史记录模块测试
 *
 * 测试功能：
 * - 记录交易决策
 * - 记录交易执行
 * - 记录交易结果
 * - 计算性能统计
 * - 分析决策模式
 * - 生成AI反馈
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import {
  TradeHistory,
  type TradeRecord,
} from '../../src/history';
import type {
  CoordinatedDecision,
  ExecutionResult,
} from '../../src/trading';
import type { PriceData, TechnicalIndicators } from '../../src/market';

/**
 * 创建测试用价格数据
 */
function createTestPriceData(coin: string, price: number): PriceData {
  return {
    coin,
    price,
    change24h: (Math.random() - 0.5) * 10,
    high24h: price * 1.05,
    low24h: price * 0.95,
    volume24h: 1000000,
    volumeCcy24h: 10000000,
    timestamp: Date.now(),
  };
}

/**
 * 创建测试用技术指标
 */
function createTestIndicators(): TechnicalIndicators {
  return {
    ma: { ma7: 43000, ma25: 42500, ma99: 42000 },
    rsi: 55,
    macd: { macd: 10, signal: 8, histogram: 2 },
    bollinger: { upper: 44000, middle: 43000, lower: 42000 },
  };
}

/**
 * 创建测试用交易决策
 */
function createTestDecision(coin: string, action: 'buy' | 'sell', price: number): CoordinatedDecision {
  return {
    timestamp: Date.now(),
    coin,
    action,
    confidence: 0.75,
    combinedScore: action === 'buy' ? 0.7 : -0.7,
    aiScore: action === 'buy' ? 0.8 : -0.8,
    ruleScore: action === 'buy' ? 0.6 : -0.6,
    reason: '测试决策',
    suggestedPrice: price,
    suggestedAmount: 100,
    source: 'coordinated',
  };
}

// =====================================================
// 基础功能测试
// =====================================================

describe('TradeHistory - 基础功能', () => {
  let history: TradeHistory;

  beforeEach(() => {
    history = new TradeHistory(':memory:');
  });

  test('应该记录交易决策', () => {
    const decision = createTestDecision('BTC', 'buy', 43000);
    const priceData = createTestPriceData('BTC', 43000);

    const id = history.recordDecision(decision, { price: priceData });

    expect(id).toBeDefined();
    expect(id).toMatch(/^trade_/);
  });

  test('应该记录交易执行', () => {
    const decision = createTestDecision('BTC', 'buy', 43000);
    const priceData = createTestPriceData('BTC', 43000);

    history.recordDecision(decision, { price: priceData });

    const execution: ExecutionResult = {
      success: true,
      decision,
      executedAt: Date.now(),
      orderId: 'order_123',
      actualPrice: 43100,
      actualAmount: 100,
    };

    history.recordExecution(execution);

    const trades = history.getRecentTrades(1);
    expect(trades).toHaveLength(1);
    expect(trades[0].execution?.orderId).toBe('order_123');
    expect(trades[0].execution?.actualPrice).toBe(43100);
  });

  test('应该记录交易结果', () => {
    const decision = createTestDecision('BTC', 'buy', 43000);
    const priceData = createTestPriceData('BTC', 43000);

    history.recordDecision(decision, { price: priceData });

    // 记录平仓结果
    history.recordTradeResult('BTC', 44000, Date.now() + 3600000);

    const trades = history.getRecentTrades(1);
    expect(trades[0].result).toBeDefined();
    expect(trades[0].result?.closePrice).toBe(44000);
    // suggestedAmount = 100 USDT, 买入 100/43000 ≈ 0.002326 BTC
    // 盈亏 = (44000 - 43000) * 0.002326 ≈ 2.33 USDT
    expect(trades[0].result?.pnl).toBeCloseTo(2.33, 1);
    expect(trades[0].result?.pnlPercent).toBeCloseTo(2.33, 1);
  });

  test('应该计算盈利交易', () => {
    const decision = createTestDecision('BTC', 'buy', 43000);
    const priceData = createTestPriceData('BTC', 43000);

    history.recordDecision(decision, { price: priceData });

    // 以更高价格平仓（盈利）
    history.recordTradeResult('BTC', 44000, Date.now() + 3600000);

    const stats = history.getPerformanceStats();
    expect(stats.totalTrades).toBe(1);
    expect(stats.winningTrades).toBe(1);
    expect(stats.losingTrades).toBe(0);
    expect(stats.winRate).toBe(1);
    expect(stats.totalPnL).toBeGreaterThan(0);
  });

  test('应该计算亏损交易', () => {
    const decision = createTestDecision('BTC', 'buy', 43000);
    const priceData = createTestPriceData('BTC', 43000);

    history.recordDecision(decision, { price: priceData });

    // 以更低价格平仓（亏损）
    history.recordTradeResult('BTC', 42000, Date.now() + 3600000);

    const stats = history.getPerformanceStats();
    expect(stats.totalTrades).toBe(1);
    expect(stats.winningTrades).toBe(0);
    expect(stats.losingTrades).toBe(1);
    expect(stats.winRate).toBe(0);
    expect(stats.totalPnL).toBeLessThan(0);
  });
});

// =====================================================
// 性能统计测试
// =====================================================

describe('TradeHistory - 性能统计', () => {
  let history: TradeHistory;

  beforeEach(() => {
    history = new TradeHistory(':memory:');
  });

  test('应该正确计算胜率', () => {
    // 5笔交易：3赢2输
    for (let i = 0; i < 5; i++) {
      const decision = createTestDecision('BTC', 'buy', 43000);
      const priceData = createTestPriceData('BTC', 43000);
      history.recordDecision(decision, { price: priceData });

      const isWin = i < 3;
      history.recordTradeResult('BTC', isWin ? 44000 : 42000, Date.now() + (i + 1) * 3600000);
    }

    const stats = history.getPerformanceStats();
    expect(stats.totalTrades).toBe(5);
    expect(stats.winningTrades).toBe(3);
    expect(stats.losingTrades).toBe(2);
    expect(stats.winRate).toBe(0.6);
  });

  test('应该计算盈亏比', () => {
    const history2 = new TradeHistory(':memory:');

    // 3笔BTC盈利：买入43000，卖出44000，100 USDT
    // PnL = (44000 - 43000) * (100 / 43000) ≈ 2.33 USDT
    for (let i = 0; i < 3; i++) {
      const decision = createTestDecision('BTC', 'buy', 43000);
      history2.recordDecision(decision, { price: createTestPriceData('BTC', 43000) });
      history2.recordTradeResult('BTC', 44000, Date.now() + (i + 1) * 3600000);
    }

    // 2笔ETH亏损：买入2300，卖出2250，100 USDT
    // PnL = (2250 - 2300) * (100 / 2300) ≈ -2.17 USDT
    for (let i = 0; i < 2; i++) {
      const decision = createTestDecision('ETH', 'buy', 2300);
      history2.recordDecision(decision, { price: createTestPriceData('ETH', 2300) });
      history2.recordTradeResult('ETH', 2250, Date.now() + (i + 4) * 3600000);
    }

    const stats = history2.getPerformanceStats();
    expect(stats.avgWin).toBeCloseTo(2.33, 1); // ~2.33 USDT
    expect(stats.avgLoss).toBeCloseTo(-2.17, 1); // ~-2.17 USDT
    expect(stats.profitFactor).toBeCloseTo(1.07, 1); // 2.33 / 2.17 ≈ 1.07
  });

  test('应该计算最大回撤', () => {
    const history2 = new TradeHistory(':memory:');

    // 价格变化：+100, +50, -80, -30, +60 (USDT)
    // 但实际PnL会较小，因为amount = 100 / price
    const priceDiffs = [100, 50, -80, -30, 60];
    for (let i = 0; i < priceDiffs.length; i++) {
      const decision = createTestDecision('BTC', 'buy', 43000);
      history2.recordDecision(decision, { price: createTestPriceData('BTC', 43000) });
      const closePrice = 43000 + priceDiffs[i];
      history2.recordTradeResult('BTC', closePrice, Date.now() + (i + 1) * 3600000);
    }

    const stats = history2.getPerformanceStats();
    // 计算实际的最大回撤
    expect(stats.maxDrawdown).toBeGreaterThan(0);
  });

  test('应该计算平均持有时长', () => {
    // 3笔交易，分别持有时长：1小时、2小时、3小时
    for (let i = 1; i <= 3; i++) {
      const decision = createTestDecision('BTC', 'buy', 43000);
      history.recordDecision(decision, { price: createTestPriceData('BTC', 43000) });
      const closeTime = Date.now() + i * 3600000;
      history.recordTradeResult('BTC', 44000, closeTime);
    }

    const stats = history.getPerformanceStats();
    expect(stats.avgHoldDuration).toBe(2 * 3600000); // 平均2小时
  });
});

// =====================================================
// 币种表现测试
// =====================================================

describe('TradeHistory - 币种表现', () => {
  let history: TradeHistory;

  beforeEach(() => {
    history = new TradeHistory(':memory:');
  });

  test('应该计算单个币种表现', () => {
    // BTC: 3笔交易，2赢1输
    for (let i = 0; i < 3; i++) {
      const decision = createTestDecision('BTC', 'buy', 43000);
      history.recordDecision(decision, { price: createTestPriceData('BTC', 43000) });
      const isWin = i < 2;
      history.recordTradeResult('BTC', isWin ? 44000 : 42000, Date.now() + (i + 1) * 3600000);
    }

    const btcPerf = history.getCoinPerformance('BTC');
    expect(btcPerf.trades).toBe(3);
    expect(btcPerf.winRate).toBeCloseTo(0.667, 2);
    expect(btcPerf.maxWin).toBeGreaterThan(0);
    expect(btcPerf.maxLoss).toBeLessThan(0);
  });

  test('应该返回空结果给无交易的币种', () => {
    const perf = history.getCoinPerformance('ETH');
    expect(perf.trades).toBe(0);
    expect(perf.winRate).toBe(0);
  });
});

// =====================================================
// 决策模式分析测试
// =====================================================

describe('TradeHistory - 决策模式分析', () => {
  let history: TradeHistory;

  beforeEach(() => {
    history = new TradeHistory(':memory:');
  });

  test('应该按决策来源分析', () => {
    // AI决策：3笔，2赢
    for (let i = 0; i < 3; i++) {
      const decision = createTestDecision('BTC', 'buy', 43000);
      decision.source = 'ai';
      history.recordDecision(decision, { price: createTestPriceData('BTC', 43000) });
      history.recordTradeResult('BTC', i < 2 ? 44000 : 42000, Date.now() + (i + 1) * 3600000);
    }

    // 规则决策：2笔，1赢
    for (let i = 0; i < 2; i++) {
      const decision = createTestDecision('ETH', 'buy', 2300);
      decision.source = 'rule';
      history.recordDecision(decision, { price: createTestPriceData('ETH', 2300) });
      history.recordTradeResult('ETH', i < 1 ? 2400 : 2200, Date.now() + (i + 4) * 3600000);
    }

    const patterns = history.analyzeDecisionPatterns();

    expect(patterns.bySource.ai.totalTrades).toBe(3);
    expect(patterns.bySource.ai.winRate).toBeCloseTo(0.667, 2);
    expect(patterns.bySource.rule.totalTrades).toBe(2);
    expect(patterns.bySource.rule.winRate).toBe(0.5);
  });

  test('应该按市场条件分析', () => {
    // 上涨市场中的交易
    for (let i = 0; i < 2; i++) {
      const decision = createTestDecision('BTC', 'buy', 43000);
      const priceData = createTestPriceData('BTC', 43000);
      priceData.change24h = 5; // 上涨
      history.recordDecision(decision, { price: priceData });
      history.recordTradeResult('BTC', 44000, Date.now() + (i + 1) * 3600000);
    }

    const patterns = history.analyzeDecisionPatterns();
    expect(patterns.byMarketCondition.uptrend.totalTrades).toBe(2);
  });
});

// =====================================================
// AI反馈测试
// =====================================================

describe('TradeHistory - AI反馈', () => {
  let history: TradeHistory;

  beforeEach(() => {
    history = new TradeHistory(':memory:');
  });

  test('应该生成完整的反馈数据', () => {
    // 添加一些交易数据
    for (let i = 0; i < 5; i++) {
      const decision = createTestDecision('BTC', 'buy', 43000);
      const priceData = createTestPriceData('BTC', 43000);
      priceData.change24h = 3;
      history.recordDecision(decision, { price: priceData, indicators: createTestIndicators() });

      const isWin = i < 3;
      history.recordTradeResult('BTC', isWin ? 44000 : 42000, Date.now() + (i + 1) * 3600000);
    }

    const feedback = history.getTradingFeedback();

    expect(feedback.overall.totalTrades).toBe(5);
    expect(feedback.recentTrades).toHaveLength(5);
    expect(feedback.byCoin.size).toBeGreaterThan(0);
    expect(feedback.byMarketCondition.uptrend.trades).toBe(5);
    expect(feedback.failures).toBeDefined();
    expect(feedback.successes).toBeDefined();
  });

  test('应该按盈亏排序失败和成功案例', () => {
    const history2 = new TradeHistory(':memory:');

    // 3笔亏损：价格差为-10, -50, -20
    // suggestedAmount = 100 USDT, 数量 = 100/43000 ≈ 0.002326 BTC
    // PnL = 价格差 * 0.002326
    const priceDiffs = [-10, -50, -20];
    for (let i = 0; i < 3; i++) {
      const decision = createTestDecision('BTC', 'buy', 43000);
      history2.recordDecision(decision, { price: createTestPriceData('BTC', 43000) });
      history2.recordTradeResult('BTC', 43000 + priceDiffs[i], Date.now() + (i + 1) * 3600000);
    }

    const feedback = history2.getTradingFeedback();
    // 失败案例应该按亏损排序（最大的在前）
    // -50 * 0.002326 ≈ -0.116 是最大的亏损
    expect(feedback.failures[0].loss).toBeCloseTo(-0.116, 2);
    expect(feedback.failures[1].loss).toBeCloseTo(-0.046, 2);
    expect(feedback.failures[2].loss).toBeCloseTo(-0.023, 2);
  });
});

// =====================================================
// 边界情况测试
// =====================================================

describe('TradeHistory - 边界情况', () => {
  test('应该处理空历史', () => {
    const history = new TradeHistory(':memory:');

    const stats = history.getPerformanceStats();
    expect(stats.totalTrades).toBe(0);
    expect(stats.winRate).toBe(0);
  });

  test('应该清空历史', () => {
    const history = new TradeHistory(':memory:');

    const decision = createTestDecision('BTC', 'buy', 43000);
    history.recordDecision(decision, { price: createTestPriceData('BTC', 43000) });

    history.clear();

    const trades = history.getRecentTrades();
    expect(trades).toHaveLength(0);
  });

  test('应该限制返回的交易数量', () => {
    const history = new TradeHistory(':memory:');

    // 添加10笔交易
    for (let i = 0; i < 10; i++) {
      const decision = createTestDecision('BTC', 'buy', 43000);
      history.recordDecision(decision, { price: createTestPriceData('BTC', 43000) });
    }

    const trades = history.getRecentTrades(5);
    expect(trades.length).toBeLessThanOrEqual(5);
  });
});
