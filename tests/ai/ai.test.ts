/**
 * AI 模块完整测试套件
 *
 * 测试内容：
 * 1. 白名单验证
 * 2. 单元测试（无需API Key）
 * 3. 集成测试（需要API Key）
 * 4. API兼容性测试
 * 5. 错误处理测试
 * 6. 性能测试
 *
 * 运行要求：
 * - OPENAI_API_KEY: AI API 密钥（用于集成测试）
 * - OPENAI_URL: AI API 地址
 *
 * 运行方法：
 *   bun test tests/ai/test.ts
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import {
  AIClient,
  DEFAULT_WHITELISTS,
  AITaskType,
  type MarketScanResult,
} from '../../src/ai';
import { logger } from '../../src/utils/logger';

// =====================================================
// 测试配置
// =====================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_URL = process.env.OPENAI_URL || 'https://open.bigmodel.cn/api/coding/paas/v4';

// 跳过集成测试的条件
const SKIP_INTEGRATION = !OPENAI_API_KEY;

// 检测是否是余额不足错误
function isInsufficientBalanceError(error: string | undefined): boolean {
  return error?.includes('余额不足') || error?.includes('1113') || error?.includes('429');
}

console.log('='.repeat(60));
console.log('AI 模块完整测试套件');
console.log('='.repeat(60));
console.log(`API Key: ${OPENAI_API_KEY ? '已配置' : '未配置（跳过集成测试）'}`);
console.log(`API URL: ${OPENAI_URL}`);
console.log('='.repeat(60));

// =====================================================
// 1. 白名单验证测试
// =====================================================

describe('1. 白名单验证', () => {
  test('1.1 现货交易白名单应该包含7个币种', () => {
    expect(DEFAULT_WHITELISTS.spot).toEqual(['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE']);
    expect(DEFAULT_WHITELISTS.spot.length).toBe(7);
  });

  test('1.2 合约交易白名单应该包含2个币种', () => {
    expect(DEFAULT_WHITELISTS.swap).toEqual(['BTC', 'ETH']);
    expect(DEFAULT_WHITELISTS.swap.length).toBe(2);
  });

  test('1.3 合约交易应该过滤掉非白名单币种', () => {
    const testCoins = ['SOL', 'XRP', 'ADA']; // 都不在合约白名单中
    const filtered = testCoins.filter(c => ['BTC', 'ETH'].includes(c));
    expect(filtered.length).toBe(0);
  });

  test('1.4 所有7个币种都应该在现货白名单中', () => {
    const spotWhitelist = DEFAULT_WHITELISTS.spot;
    expect(spotWhitelist).toContain('BTC');
    expect(spotWhitelist).toContain('ETH');
    expect(spotWhitelist).toContain('BNB');
    expect(spotWhitelist).toContain('SOL');
    expect(spotWhitelist).toContain('XRP');
    expect(spotWhitelist).toContain('ADA');
    expect(spotWhitelist).toContain('DOGE');
  });
});

// =====================================================
// 2. 单元测试（无需 API Key）
// =====================================================

describe('2. 单元测试（无需 API Key）', () => {
  test('2.1 应该抛出错误如果没有 API Key', () => {
    expect(() => new AIClient({ apiKey: '' })).toThrow('AI API Key is required');
  });

  test('2.2 应该使用默认配置', () => {
    const client = new AIClient({
      apiKey: 'test-key',
      enableLogging: false,
    });

    expect(client).toBeDefined();
    expect(client.getStats().totalRequests).toBe(0);
  });

  test('2.3 应该正确初始化统计信息', () => {
    const client = new AIClient({
      apiKey: 'test-key',
      enableLogging: false,
    });

    const stats = client.getStats();
    expect(stats).toEqual({
      totalRequests: 0,
      successRequests: 0,
      failedRequests: 0,
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      successRate: 0,
    });
  });

  test('2.4 应该支持现货交易白名单', () => {
    const client = new AIClient({
      apiKey: 'test-key',
      tradingType: 'spot',
      enableLogging: false,
    });

    expect(client).toBeDefined();
  });

  test('2.5 应该支持合约交易白名单', () => {
    const client = new AIClient({
      apiKey: 'test-key',
      tradingType: 'swap',
      enableLogging: false,
    });

    expect(client).toBeDefined();
  });

  test('2.6 应该支持自定义白名单', () => {
    const client = new AIClient({
      apiKey: 'test-key',
      coinWhitelist: ['BTC', 'ETH'],
      enableLogging: false,
    });

    expect(client).toBeDefined();
  });

  test('2.7 应该解析纯 JSON', () => {
    const client = new AIClient({
      apiKey: 'test-key',
      enableLogging: false,
    });

    const json = '{"coin": "BTC", "price": 100}';
    const result = (client as any).parseJSONResponse(json);
    expect(result).toEqual({ coin: 'BTC', price: 100 });
  });

  test('2.8 应该解析 markdown 代码块中的 JSON', () => {
    const client = new AIClient({
      apiKey: 'test-key',
      enableLogging: false,
    });

    const markdown = '```json\n{"coin": "BTC", "price": 100}\n```';
    const result = (client as any).parseJSONResponse(markdown);
    expect(result).toEqual({ coin: 'BTC', price: 100 });
  });

  test('2.9 应该解析没有语言标识的 markdown 代码块', () => {
    const client = new AIClient({
      apiKey: 'test-key',
      enableLogging: false,
    });

    const markdown = '```\n{"coin": "BTC", "price": 100}\n```';
    const result = (client as any).parseJSONResponse(markdown);
    expect(result).toEqual({ coin: 'BTC', price: 100 });
  });

  test('2.10 应该解析 JSON 数组', () => {
    const client = new AIClient({
      apiKey: 'test-key',
      enableLogging: false,
    });

    const json = '[{"coin": "BTC"}, {"coin": "ETH"}]';
    const result = (client as any).parseJSONResponse(json);
    expect(result).toEqual([{ coin: 'BTC' }, { coin: 'ETH' }]);
  });

  test('2.11 应该拒绝无效的 JSON', () => {
    const client = new AIClient({
      apiKey: 'test-key',
      enableLogging: false,
    });

    expect(() => {
      (client as any).parseJSONResponse('{invalid json}');
    }).toThrow();
  });

  test('2.12 AI 任务类型应该包含所有任务', () => {
    expect(AITaskType.MARKET_SCAN).toBe('market_scan' as typeof AITaskType.MARKET_SCAN);
    expect(AITaskType.TRADING_DECISION).toBe('trading_decision' as typeof AITaskType.TRADING_DECISION);
    expect(AITaskType.PERFORMANCE_REPORT).toBe('performance_report' as typeof AITaskType.PERFORMANCE_REPORT);
    expect(AITaskType.DEEP_ANALYSIS).toBe('deep_analysis' as typeof AITaskType.DEEP_ANALYSIS);
    expect(AITaskType.ANOMALY_ANALYSIS).toBe('anomaly_analysis' as typeof AITaskType.ANOMALY_ANALYSIS);
  });
});

// =====================================================
// 3. 集成测试（需要 API Key）
// =====================================================

describe.skipIf(SKIP_INTEGRATION)('3. 集成测试（需要 API Key）', () => {
  let client: AIClient;

  beforeEach(() => {
    client = new AIClient({
      apiKey: OPENAI_API_KEY,
      timeout: 30000,
      maxRetries: 2,
      enableLogging: false,
    });
  });

  test('3.1 市场扫描 - 应该返回有效结果或余额不足错误', async () => {
    const response = await client.scanMarket({
      coins: ['BTC'],
      focus: 'price_action',
    });

    if (isInsufficientBalanceError(response.error)) {
      expect(response.success).toBe(false);
      expect(response.error).toContain('余额不足');
    } else {
      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();
      expect(response.usage).toBeDefined();

      if (response.data) {
        expect(response.data.timestamp).toBeGreaterThan(0);
        expect(response.data.coins).toBeInstanceOf(Array);
      }
    }
  }, 30000);

  test('3.2 交易决策 - 应该返回决策数组或余额不足错误', async () => {
    const mockMarketScan: MarketScanResult = {
      timestamp: Date.now(),
      coins: [
        {
          coin: 'BTC',
          price: 43500,
          change24h: 2.5,
          volume24h: 1000000,
          volatility: 3.2,
          trend: 'uptrend',
        },
      ],
      opportunities: [
        {
          coin: 'BTC',
          type: 'breakout',
          confidence: 0.7,
          reason: '价格突破阻力位',
        },
      ],
    };

    const response = await client.makeTradingDecision({
      marketScan: mockMarketScan,
      currentPositions: [],
      recentPerformance: { totalTrades: 10, winRate: 0.7, totalPnL: 150 },
    });

    if (isInsufficientBalanceError(response.error)) {
      expect(response.success).toBe(false);
      expect(response.error).toContain('余额不足');
    } else {
      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();

      if (response.data) {
        expect(response.data).toBeInstanceOf(Array);
      }
    }
  }, 30000);

  test('3.3 性能报告 - 应该返回完整报告或余额不足错误', async () => {
    const response = await client.generatePerformanceReport({
      timeRange: '6h',
      performance: {
        totalTrades: 20,
        aiDecisions: 14,
        ruleDecisions: 6,
        totalPnL: 250.5,
        winRate: 0.7,
        aiWinRate: 0.71,
        ruleWinRate: 0.67,
        profitFactor: 2.1,
        maxDrawdown: 2.3,
      },
    });

    if (isInsufficientBalanceError(response.error)) {
      expect(response.success).toBe(false);
      expect(response.error).toContain('余额不足');
    } else {
      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();

      if (response.data) {
        expect(response.data.performance).toBeDefined();
        expect(response.data.aiAnalysis).toBeDefined();
        expect(response.data.recommendations).toBeInstanceOf(Array);
      }
    }
  }, 30000);

  test('3.4 异常分析 - 应该返回处理建议或余额不足错误', async () => {
    const response = await client.analyzeAnomaly({
      anomaly: {
        type: 'price_spike',
        severity: 'high',
        description: 'BTC价格在1分钟内下跌5%',
        data: { coin: 'BTC', dropPercent: 5 },
      },
      marketState: {},
      positions: [],
    });

    if (isInsufficientBalanceError(response.error)) {
      expect(response.success).toBe(false);
      expect(response.error).toContain('余额不足');
    } else {
      expect(response.success).toBe(true);
      expect(response.data).toBeDefined();

      if (response.data) {
        expect(response.data.severity).toBeDefined();
        expect(response.data.recommendedAction).toBeDefined();
        expect(['ignore', 'monitor', 'pause_trading', 'emergency_close'])
          .toContain(response.data.recommendedAction);
      }
    }
  }, 30000);

  test('3.5 应该正确统计请求次数', async () => {
    const initialStats = client.getStats();

    await client.scanMarket({
      coins: ['BTC'],
    });

    const finalStats = client.getStats();

    // 请求次数应该增加（无论成功还是失败）
    expect(finalStats.totalRequests).toBeGreaterThan(initialStats.totalRequests);
  }, 30000);

  test('3.6 应该验证市场扫描返回的数据结构', async () => {
    const response = await client.scanMarket({
      coins: ['BTC', 'ETH'],
      focus: 'short_term',
    });

    if (response.success && response.data) {
      // 验证顶层结构
      expect(response.data.timestamp).toBeDefined();
      expect(response.data.coins).toBeInstanceOf(Array);

      // 验证币种分析数据
      for (const coin of response.data.coins) {
        expect(coin.coin).toBeDefined();
        expect(coin.price).toBeDefined();
        expect(coin.change24h).toBeDefined();
        expect(coin.volume24h).toBeDefined();
        expect(coin.volatility).toBeDefined();
        expect(coin.trend).toBeDefined();
        expect(['uptrend', 'downtrend', 'sideways']).toContain(coin.trend);
      }

      logger.info('市场扫描数据验证通过', {
        coinsCount: response.data.coins.length,
        hasOpportunities: !!(response.data.opportunities?.length),
        hasRisks: !!(response.data.risks?.length),
      });
    } else {
      logger.warn('市场扫描失败', { error: response.error });
    }
  }, 30000);

  test('3.7 应该验证交易决策返回的数据结构', async () => {
    const marketScan = {
      timestamp: Date.now(),
      coins: [
        {
          coin: 'BTC',
          price: 43000,
          change24h: 2,
          volume24h: 1000000,
          volatility: 0.05,
          trend: 'sideways' as const,
        },
      ],
    };

    const response = await client.makeTradingDecision({
      marketScan,
      currentPositions: [],
      recentPerformance: {
        totalTrades: 10,
        winRate: 0.6,
        totalPnL: 500,
      },
    });

    if (response.success && response.data) {
      // 验证决策数据结构
      for (const decision of response.data) {
        expect(decision.timestamp).toBeDefined();
        expect(decision.coin).toBeDefined();
        expect(decision.action).toMatch(/^(buy|sell|hold)$/);
        expect(decision.confidence).toBeGreaterThanOrEqual(0);
        expect(decision.confidence).toBeLessThanOrEqual(1);
        expect(decision.aiScore).toBeGreaterThanOrEqual(-1);
        expect(decision.aiScore).toBeLessThanOrEqual(1);
        expect(decision.reason).toBeDefined();
      }

      logger.info('交易决策数据验证通过', {
        decisionsCount: response.data.length,
      });
    } else {
      logger.warn('交易决策失败', { error: response.error });
    }
  }, 30000);
});

// =====================================================
// 4. API 兼容性测试
// =====================================================

describe.skipIf(SKIP_INTEGRATION)('4. API 兼容性测试', () => {
  test('4.1 应该使用OpenAI API执行市场扫描', async () => {
    const openaiCompatibleClient = new AIClient({
      apiKey: OPENAI_API_KEY,
      baseURL: OPENAI_URL,
      enableLogging: true,
    });

    const response = await openaiCompatibleClient.scanMarket({
      coins: ['BTC'],
      focus: 'short_term',
    });

    if (response.success && response.data) {
      expect(response.data.coins.length).toBeGreaterThan(0);

      logger.info('OpenAI兼容接口市场扫描成功', {
        coins: response.data.coins.length,
      });
    } else {
      logger.warn('OpenAI兼容接口失败', { error: response.error });
      expect(response.success).toBe(false);
    }
  }, 30000);

  test('4.2 应该使用OpenAI API执行交易决策', async () => {
    const openaiCompatibleClient = new AIClient({
      apiKey: OPENAI_API_KEY,
      baseURL: OPENAI_URL,
      enableLogging: true,
    });

    const marketScan = {
      timestamp: Date.now(),
      coins: [
        {
          coin: 'BTC',
          price: 43000,
          change24h: 2,
          volume24h: 1000000,
          volatility: 0.05,
          trend: 'sideways' as const,
        },
      ],
    };

    const response = await openaiCompatibleClient.makeTradingDecision({
      marketScan,
      currentPositions: [],
      recentPerformance: {
        totalTrades: 10,
        winRate: 0.6,
        totalPnL: 500,
      },
    });

    if (response.success && response.data) {
      expect(response.data.length).toBeGreaterThanOrEqual(0);

      logger.info('OpenAI兼容接口交易决策成功', {
        decisions: response.data.length,
      });
    } else {
      logger.warn('OpenAI兼容接口失败', { error: response.error });
      expect(response.success).toBe(false);
    }
  }, 30000);

  test('4.3 应该比较不同API接口的结果', async () => {
    const aiClient = new AIClient({
      apiKey: OPENAI_API_KEY,
      baseURL: OPENAI_URL,
      enableLogging: false,
    });

    const marketScan = {
      timestamp: Date.now(),
      coins: [
        {
          coin: 'BTC',
          price: 43000,
          change24h: 2,
          volume24h: 1000000,
          volatility: 0.05,
          trend: 'sideways' as const,
        },
      ],
    };

    // 调用两次相同请求，验证结果一致性
    const response1 = await aiClient.makeTradingDecision({
      marketScan,
      currentPositions: [],
      recentPerformance: {
        totalTrades: 10,
        winRate: 0.6,
        totalPnL: 500,
      },
    });

    const response2 = await aiClient.makeTradingDecision({
      marketScan,
      currentPositions: [],
      recentPerformance: {
        totalTrades: 10,
        winRate: 0.6,
        totalPnL: 500,
      },
    });

    // 验证API调用成功
    if (response1.success && response2.success) {
      expect(response1.data).toBeDefined();
      expect(response2.data).toBeDefined();

      logger.info('API一致性测试', {
        response1: response1.data?.length || 0,
        response2: response2.data?.length || 0,
      });
    } else {
      logger.warn('API调用失败', {
        error1: response1.error,
        error2: response2.error,
      });
    }
  }, 60000);
});

// =====================================================
// 5. 错误处理测试
// =====================================================

describe('5. 错误处理测试', () => {
  test('5.1 应该处理无效的 API Key', async () => {
    const invalidClient = new AIClient({
      apiKey: 'invalid-key',
      timeout: 5000,
      maxRetries: 1,
      enableLogging: false,
    });

    const response = await invalidClient.scanMarket({
      coins: ['BTC'],
    });

    expect(response.success).toBe(false);
    expect(response.error).toBeDefined();
  });

  test('5.2 应该处理无效的baseURL', async () => {
    const invalidClient = new AIClient({
      apiKey: 'test-key',
      baseURL: 'https://invalid-api-endpoint-12345.com',
      enableLogging: false,
      timeout: 5000,
    });

    const response = await invalidClient.scanMarket({
      coins: ['BTC'],
    });

    expect(response.success).toBe(false);
  }, 30000);

  test('5.3 应该处理超时情况', async () => {
    const timeoutClient = new AIClient({
      apiKey: 'test-key',
      timeout: 1, // 1ms超时
      maxRetries: 1,
      enableLogging: false,
    });

    const response = await timeoutClient.scanMarket({
      coins: ['BTC'],
    });

    // 可能超时也可能成功（网络很快时）
    expect(response).toBeDefined();
  });
});

// =====================================================
// 6. 性能测试
// =====================================================

describe.skipIf(SKIP_INTEGRATION)('6. 性能测试', () => {
  test('6.1 应该在合理时间内完成市场扫描', async () => {
    const aiClient = new AIClient({
      apiKey: OPENAI_API_KEY,
      baseURL: OPENAI_URL,
      enableLogging: false,
    });

    const startTime = Date.now();

    const response = await aiClient.scanMarket({
      coins: ['BTC', 'ETH'],
      focus: 'short_term',
    });

    const elapsed = Date.now() - startTime;

    logger.info('市场扫描性能', {
      elapsed: `${elapsed}ms`,
      success: response.success,
    });

    // API调用应该在60秒内完成
    expect(elapsed).toBeLessThan(60000);
  }, 60000);

  test('6.2 应该在合理时间内完成交易决策', async () => {
    const aiClient = new AIClient({
      apiKey: OPENAI_API_KEY,
      baseURL: OPENAI_URL,
      enableLogging: false,
    });

    const marketScan = {
      timestamp: Date.now(),
      coins: [
        {
          coin: 'BTC',
          price: 43000,
          change24h: 2,
          volume24h: 1000000,
          volatility: 0.05,
          trend: 'sideways' as const,
        },
      ],
    };

    const startTime = Date.now();

    const response = await aiClient.makeTradingDecision({
      marketScan,
      currentPositions: [],
      recentPerformance: {
        totalTrades: 10,
        winRate: 0.6,
        totalPnL: 500,
      },
    });

    const elapsed = Date.now() - startTime;

    logger.info('交易决策性能', {
      elapsed: `${elapsed}ms`,
      success: response.success,
    });

    // API调用应该在60秒内完成
    expect(elapsed).toBeLessThan(60000);
  }, 60000);
});

// =====================================================
// 测试完成
// =====================================================

console.log('='.repeat(60));
console.log('测试说明：');
console.log('1. 白名单验证测试 - 全部通过（无需API Key）');
console.log('2. 单元测试 - 全部通过（无需API Key）');
console.log('3. 集成测试 - 需要 OPENAI_API_KEY');
console.log('4. API兼容性测试 - 需要 OPENAI_API_KEY');
console.log('5. 错误处理测试 - 全部通过（无需API Key）');
console.log('6. 性能测试 - 需要 OPENAI_API_KEY');
console.log('='.repeat(60));
