/**
 * 安全验证器测试
 *
 * 测试功能：
 * - 余额检查
 * - 持仓检查
 * - 价格合理性检查
 * - 交易金额检查
 * - 市场状态检查
 * - 交易频率检查
 * - 单日交易次数检查
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import {
  SafetyValidator,
  SafetyCheckResult,
  SafetyCheckType,
  TradeActionType,
  type TradeRequest,
  type MarketStatus,
  type AccountStatus,
} from '../../src/safety';

// =====================================================
// 测试数据
// =====================================================

const createMarketStatus = (overrides?: Partial<MarketStatus>): MarketStatus => ({
  isNormal: true,
  volatility: 0.05,
  volume24h: 1000000,
  change24h: 2.5,
  ...overrides,
});

const createAccountStatus = (overrides?: Partial<AccountStatus>): AccountStatus => ({
  availableBalance: 10000,
  positions: [],
  todayTradeCount: 0,
  todayTradeAmountByCoin: new Map(),
  lastTradeTime: 0,
  ...overrides,
});

const createTradeRequest = (overrides?: Partial<TradeRequest>): TradeRequest => ({
  actionType: TradeActionType.BUY,
  coin: 'BTC',
  price: 43000,
  amount: 0.1,
  value: 4300,
  signalSource: 'ai',
  timestamp: Date.now(),
  ...overrides,
});

// =====================================================
// 基础功能测试
// =====================================================

describe('安全验证器 - 基础功能', () => {
  test('应该使用默认配置创建', () => {
    const validator = new SafetyValidator();
    const config = validator.getConfig();

    expect(config.enabled).toBe(true);
    expect(config.minReserveBalance).toBe(100);
    expect(config.maxSingleTradeAmount).toBe(5000);
    expect(config.minSingleTradeAmount).toBe(10);
  });

  test('应该使用自定义配置创建', () => {
    const validator = new SafetyValidator({
      enabled: false,
      minReserveBalance: 200,
      maxSingleTradeAmount: 10000,
    });

    const config = validator.getConfig();
    expect(config.enabled).toBe(false);
    expect(config.minReserveBalance).toBe(200);
    expect(config.maxSingleTradeAmount).toBe(10000);
  });

  test('应该更新配置', () => {
    const validator = new SafetyValidator();
    validator.updateConfig({ maxSingleTradeAmount: 8000 });

    const config = validator.getConfig();
    expect(config.maxSingleTradeAmount).toBe(8000);
  });

  test('禁用时应通过所有验证', async () => {
    const validator = new SafetyValidator({ enabled: false });
    const request = createTradeRequest({ value: 999999 });
    const market = createMarketStatus();
    const account = createAccountStatus({ availableBalance: 0 });

    const result = await validator.validateTrade(request, market, account);

    expect(result.passed).toBe(true);
    expect(result.checks).toHaveLength(0);
  });
});

// =====================================================
// 余额检查测试
// =====================================================

describe('安全验证器 - 余额检查', () => {
  test('买入时余额充足应该通过', async () => {
    const validator = new SafetyValidator({
      minReserveBalance: 100,
    });

    const request = createTradeRequest({
      actionType: TradeActionType.BUY,
      value: 5000,
    });

    const account = createAccountStatus({
      availableBalance: 6000, // 5000 + 100 = 5100 < 6000
    });

    const market = createMarketStatus();
    const result = await validator.validateTrade(request, market, account);

    expect(result.passed).toBe(true);
    const balanceCheck = result.checks.find(c => c.type === SafetyCheckType.SUFFICIENT_BALANCE);
    expect(balanceCheck?.result).toBe(SafetyCheckResult.PASSED);
  });

  test('买入时余额不足应该拒绝', async () => {
    const validator = new SafetyValidator({
      minReserveBalance: 100,
    });

    const request = createTradeRequest({
      actionType: TradeActionType.BUY,
      value: 5000,
    });

    const account = createAccountStatus({
      availableBalance: 4000, // 5000 + 100 = 5100 > 4000
    });

    const market = createMarketStatus();
    const result = await validator.validateTrade(request, market, account);

    expect(result.passed).toBe(false);
    const balanceCheck = result.checks.find(c => c.type === SafetyCheckType.SUFFICIENT_BALANCE);
    expect(balanceCheck?.result).toBe(SafetyCheckResult.BLOCKED);
  });

  test('卖出时不检查余额', async () => {
    const validator = new SafetyValidator();
    const request = createTradeRequest({
      actionType: TradeActionType.SELL,
    });

    const account = createAccountStatus({
      availableBalance: 0,
    });

    const market = createMarketStatus();
    const result = await validator.validateTrade(request, market, account);

    const balanceCheck = result.checks.find(c => c.type === SafetyCheckType.SUFFICIENT_BALANCE);
    expect(balanceCheck?.result).toBe(SafetyCheckResult.PASSED);
  });
});

// =====================================================
// 持仓检查测试
// =====================================================

describe('安全验证器 - 持仓检查', () => {
  test('卖出时持仓充足应该通过', async () => {
    const validator = new SafetyValidator();

    const request = createTradeRequest({
      actionType: TradeActionType.SELL,
      amount: 0.1,
      coin: 'BTC',
    });

    const account = createAccountStatus({
      positions: [
        {
          coin: 'BTC',
          amount: 0.5,
          avgCost: 42000,
          unrealizedPnL: 500,
        },
      ],
    });

    const market = createMarketStatus();
    const result = await validator.validateTrade(request, market, account);

    expect(result.passed).toBe(true);
    const positionCheck = result.checks.find(c => c.type === SafetyCheckType.SUFFICIENT_POSITION);
    expect(positionCheck?.result).toBe(SafetyCheckResult.PASSED);
  });

  test('卖出时持仓不足应该拒绝', async () => {
    const validator = new SafetyValidator();

    const request = createTradeRequest({
      actionType: TradeActionType.SELL,
      amount: 0.5,
      coin: 'BTC',
    });

    const account = createAccountStatus({
      positions: [
        {
          coin: 'BTC',
          amount: 0.1,
          avgCost: 42000,
          unrealizedPnL: 100,
        },
      ],
    });

    const market = createMarketStatus();
    const result = await validator.validateTrade(request, market, account);

    expect(result.passed).toBe(false);
    const positionCheck = result.checks.find(c => c.type === SafetyCheckType.SUFFICIENT_POSITION);
    expect(positionCheck?.result).toBe(SafetyCheckResult.BLOCKED);
  });

  test('买入时不检查持仓', async () => {
    const validator = new SafetyValidator();
    const request = createTradeRequest({
      actionType: TradeActionType.BUY,
    });

    const account = createAccountStatus({
      positions: [],
    });

    const market = createMarketStatus();
    const result = await validator.validateTrade(request, market, account);

    const positionCheck = result.checks.find(c => c.type === SafetyCheckType.SUFFICIENT_POSITION);
    expect(positionCheck?.result).toBe(SafetyCheckResult.PASSED);
  });
});

// =====================================================
// 交易金额检查测试
// =====================================================

describe('安全验证器 - 交易金额检查', () => {
  test('交易金额在范围内应该通过', async () => {
    const validator = new SafetyValidator({
      minSingleTradeAmount: 10,
      maxSingleTradeAmount: 5000,
    });

    const request = createTradeRequest({
      value: 1000,
    });

    const market = createMarketStatus();
    const account = createAccountStatus();
    const result = await validator.validateTrade(request, market, account);

    const amountCheck = result.checks.find(c => c.type === SafetyCheckType.AMOUNT_REASONABLE);
    expect(amountCheck?.result).toBe(SafetyCheckResult.PASSED);
  });

  test('交易金额过小应该拒绝', async () => {
    const validator = new SafetyValidator({
      minSingleTradeAmount: 100,
    });

    const request = createTradeRequest({
      value: 50,
    });

    const market = createMarketStatus();
    const account = createAccountStatus();
    const result = await validator.validateTrade(request, market, account);

    expect(result.passed).toBe(false);
    const amountCheck = result.checks.find(c => c.type === SafetyCheckType.AMOUNT_REASONABLE);
    expect(amountCheck?.result).toBe(SafetyCheckResult.BLOCKED);
  });

  test('交易金额过大应该拒绝', async () => {
    const validator = new SafetyValidator({
      maxSingleTradeAmount: 3000,
    });

    const request = createTradeRequest({
      value: 5000,
    });

    const market = createMarketStatus();
    const account = createAccountStatus();
    const result = await validator.validateTrade(request, market, account);

    expect(result.passed).toBe(false);
    const amountCheck = result.checks.find(c => c.type === SafetyCheckType.AMOUNT_REASONABLE);
    expect(amountCheck?.result).toBe(SafetyCheckResult.BLOCKED);
  });
});

// =====================================================
// 市场状态检查测试
// =====================================================

describe('安全验证器 - 市场状态检查', () => {
  test('市场正常应该通过', async () => {
    const validator = new SafetyValidator();
    const request = createTradeRequest();
    const market = createMarketStatus({ isNormal: true });
    const account = createAccountStatus();

    const result = await validator.validateTrade(request, market, account);

    const marketCheck = result.checks.find(c => c.type === SafetyCheckType.MARKET_NORMAL);
    expect(marketCheck?.result).toBe(SafetyCheckResult.PASSED);
  });

  test('市场异常应该拒绝', async () => {
    const validator = new SafetyValidator();
    const request = createTradeRequest();
    const market = createMarketStatus({
      isNormal: false,
      abnormalReason: '价格剧烈波动',
    });
    const account = createAccountStatus();

    const result = await validator.validateTrade(request, market, account);

    expect(result.passed).toBe(false);
    const marketCheck = result.checks.find(c => c.type === SafetyCheckType.MARKET_NORMAL);
    expect(marketCheck?.result).toBe(SafetyCheckResult.BLOCKED);
  });

  test('高波动率应该警告', async () => {
    const validator = new SafetyValidator({
      abnormalVolatilityThreshold: 15,
    });

    const request = createTradeRequest();
    const market = createMarketStatus({
      isNormal: true,
      change24h: -20, // 20% 下跌
    });
    const account = createAccountStatus();

    const result = await validator.validateTrade(request, market, account);

    const marketCheck = result.checks.find(c => c.type === SafetyCheckType.MARKET_NORMAL);
    expect(marketCheck?.result).toBe(SafetyCheckResult.WARNING);
  });

  test('禁用市场状态检查应该通过', async () => {
    const validator = new SafetyValidator({
      enableMarketStatusCheck: false,
    });

    const request = createTradeRequest();
    const market = createMarketStatus({
      isNormal: false,
      abnormalReason: '异常',
    });
    const account = createAccountStatus();

    const result = await validator.validateTrade(request, market, account);

    const marketCheck = result.checks.find(c => c.type === SafetyCheckType.MARKET_NORMAL);
    expect(marketCheck?.result).toBe(SafetyCheckResult.PASSED);
  });
});

// =====================================================
// 交易频率检查测试
// =====================================================

describe('安全验证器 - 交易频率检查', () => {
  test('距上次交易时间足够应该通过', async () => {
    const validator = new SafetyValidator({
      tradeFrequencyLimit: 10,
    });

    const request = createTradeRequest({
      timestamp: 20000,
    });

    const account = createAccountStatus({
      lastTradeTime: 5000, // 15秒前
    });

    const market = createMarketStatus();
    const result = await validator.validateTrade(request, market, account);

    const frequencyCheck = result.checks.find(c => c.type === SafetyCheckType.FREQUENCY_LIMIT);
    expect(frequencyCheck?.result).toBe(SafetyCheckResult.PASSED);
  });

  test('距上次交易时间过短应该拒绝', async () => {
    const validator = new SafetyValidator({
      tradeFrequencyLimit: 10,
    });

    const request = createTradeRequest({
      timestamp: 15000,
    });

    const account = createAccountStatus({
      lastTradeTime: 10000, // 5秒前
    });

    const market = createMarketStatus();
    const result = await validator.validateTrade(request, market, account);

    expect(result.passed).toBe(false);
    const frequencyCheck = result.checks.find(c => c.type === SafetyCheckType.FREQUENCY_LIMIT);
    expect(frequencyCheck?.result).toBe(SafetyCheckResult.BLOCKED);
  });
});

// =====================================================
// 单日交易次数检查测试
// =====================================================

describe('安全验证器 - 单日交易次数检查', () => {
  test('未达到次数限制应该通过', async () => {
    const validator = new SafetyValidator({
      maxDailyTrades: 50,
    });

    const request = createTradeRequest();
    const market = createMarketStatus();
    const account = createAccountStatus();

    const result = await validator.validateTrade(request, market, account);

    const dailyCheck = result.checks.find(c => c.type === SafetyCheckType.DAILY_TRADE_LIMIT);
    expect(dailyCheck?.result).toBe(SafetyCheckResult.PASSED);
  });

  test('接近次数限制应该警告', async () => {
    const validator = new SafetyValidator({
      maxDailyTrades: 50,
    });

    // 记录46笔交易
    for (let i = 0; i < 46; i++) {
      validator.recordTrade(createTradeRequest({ coin: 'BTC' + i }));
    }

    const request = createTradeRequest();
    const market = createMarketStatus();
    const account = createAccountStatus();

    const result = await validator.validateTrade(request, market, account);

    const dailyCheck = result.checks.find(c => c.type === SafetyCheckType.DAILY_TRADE_LIMIT);
    expect(dailyCheck?.result).toBe(SafetyCheckResult.WARNING);
  });

  test('达到次数限制应该拒绝', async () => {
    const validator = new SafetyValidator({
      maxDailyTrades: 50,
    });

    // 记录50笔交易
    for (let i = 0; i < 50; i++) {
      validator.recordTrade(createTradeRequest({ coin: 'BTC' + i }));
    }

    const request = createTradeRequest();
    const market = createMarketStatus();
    const account = createAccountStatus();

    const result = await validator.validateTrade(request, market, account);

    expect(result.passed).toBe(false);
    const dailyCheck = result.checks.find(c => c.type === SafetyCheckType.DAILY_TRADE_LIMIT);
    expect(dailyCheck?.result).toBe(SafetyCheckResult.BLOCKED);
  });
});

// =====================================================
// 交易记录管理测试
// =====================================================

describe('安全验证器 - 交易记录管理', () => {
  test('应该记录交易', () => {
    const validator = new SafetyValidator();
    const trade = createTradeRequest();

    validator.recordTrade(trade);

    expect(validator.getTodayTradeCount()).toBe(1);
  });

  test('应该按币种统计交易次数', () => {
    const validator = new SafetyValidator();

    validator.recordTrade(createTradeRequest({ coin: 'BTC' }));
    validator.recordTrade(createTradeRequest({ coin: 'BTC' }));
    validator.recordTrade(createTradeRequest({ coin: 'ETH' }));

    expect(validator.getTodayTradeCount('BTC')).toBe(2);
    expect(validator.getTodayTradeCount('ETH')).toBe(1);
    expect(validator.getTodayTradeCount()).toBe(3);
  });

  test('应该重置今日统计', () => {
    const validator = new SafetyValidator();

    validator.recordTrade(createTradeRequest({ coin: 'BTC' }));
    expect(validator.getTodayTradeCount()).toBe(1);

    validator.resetTodayStats();
    expect(validator.getTodayTradeCount()).toBe(0);
  });
});
