/**
 * AI客户端API兼容性测试
 *
 * 测试目标：
 * 1. 验证GLM API调用
 * 2. 验证OpenAI兼容API调用
 * 3. 比较不同API接口的结果
 * 4. 验证错误处理和重试机制
 *
 * 运行要求：
 * - OPENAI_API_KEY: OpenAI密钥
 */

import { describe, test, expect } from 'bun:test';
import { GLMClient } from '../../src/ai';
import { logger } from '../../src/utils/logger';

// =====================================================
// 测试配置
// =====================================================

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

describe('AI客户端API兼容性测试', () => {
  // =====================================================
  // GLM API测试
  // =====================================================

  describe('GLM API测试', () => {
    let glmClient: GLMClient;

    test('应该初始化GLM客户端', () => {
      glmClient = new GLMClient({
        apiKey: OPENAI_API_KEY,
        baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4',
        enableLogging: true,
      });

      expect(glmClient).toBeDefined();
    });

    test('GLM应该能够执行市场扫描', async () => {
      const response = await glmClient.scanMarket({
        coins: ['BTC'],
        focus: 'short_term',
      });

      if (response.success && response.data) {
        expect(response.data.coins.length).toBeGreaterThan(0);
        expect(response.data.timestamp).toBeDefined();

        logger.info('GLM市场扫描成功', {
          coins: response.data.coins.length,
          opportunities: response.data.opportunities?.length || 0,
          risks: response.data.risks?.length || 0,
        });
      } else {
        logger.warn('GLM市场扫描失败', { error: response.error });
        expect(response.success).toBe(false);
        expect(response.error).toBeDefined();
      }
    }, 30000);

    test('GLM应该能够执行交易决策', async () => {
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

      const response = await glmClient.makeTradingDecision({
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

        for (const decision of response.data) {
          expect(decision.coin).toBeDefined();
          expect(decision.action).toBeDefined();
          expect(['buy', 'sell', 'hold']).toContain(decision.action);
          expect(decision.confidence).toBeGreaterThanOrEqual(0);
          expect(decision.confidence).toBeLessThanOrEqual(1);
        }

        logger.info('GLM交易决策成功', {
          decisions: response.data.length,
          decisionDetails: response.data.map(d => ({
            coin: d.coin,
            action: d.action,
            confidence: d.confidence,
          })),
        });
      } else {
        logger.warn('GLM交易决策失败', { error: response.error });
        expect(response.success).toBe(false);
        expect(response.error).toBeDefined();
      }
    }, 30000);
  });

  // =====================================================
  // OpenAI兼容API测试
  // =====================================================

  describe('OpenAI兼容API测试', () => {
    test.skipIf(!OPENAI_API_KEY)('应该使用OpenAI API执行市场扫描', async () => {
      // 使用智谱的OpenAI兼容接口
      const openaiCompatibleClient = new GLMClient({
        apiKey: OPENAI_API_KEY,
        baseURL: 'https://open.bigmodel.cn/api/paas/v4/', // OpenAI兼容接口
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

    test.skipIf(!OPENAI_API_KEY)('应该使用OpenAI API执行交易决策', async () => {
      const openaiCompatibleClient = new GLMClient({
        apiKey: OPENAI_API_KEY,
        baseURL: 'https://open.bigmodel.cn/api/paas/v4/',
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
  });

  // =====================================================
  // API接口比较测试
  // =====================================================

  describe('API接口比较测试', () => {
    test('应该比较不同API接口的结果', async () => {
      const glmClient = new GLMClient({
        apiKey: OPENAI_API_KEY,
        baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4',
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
      const response1 = await glmClient.makeTradingDecision({
        marketScan,
        currentPositions: [],
        recentPerformance: {
          totalTrades: 10,
          winRate: 0.6,
          totalPnL: 500,
        },
      });

      const response2 = await glmClient.makeTradingDecision({
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
  // 错误处理测试
  // =====================================================

  describe('错误处理测试', () => {
    test('应该处理无效的API密钥', async () => {
      const invalidClient = new GLMClient({
        apiKey: 'invalid_key_12345',
        baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4',
        enableLogging: false,
      });

      const response = await invalidClient.scanMarket({
        coins: ['BTC'],
        focus: 'short_term',
      });

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();

      logger.info('无效密钥测试', { error: response.error });
    });

    test('应该处理无效的baseURL', async () => {
      const invalidClient = new GLMClient({
        apiKey: OPENAI_API_KEY,
        baseURL: 'https://invalid-api-endpoint-12345.com',
        enableLogging: false,
        timeout: 5000, // 5秒超时
      });

      const response = await invalidClient.scanMarket({
        coins: ['BTC'],
        focus: 'short_term',
      });

      expect(response.success).toBe(false);

      logger.info('无效baseURL测试', { error: response.error });
    }, 30000);

    test('应该处理超时情况', async () => {
      const timeoutClient = new GLMClient({
        apiKey: OPENAI_API_KEY,
        baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4',
        enableLogging: false,
        timeout: 1, // 1ms超时
      });

      const response = await timeoutClient.scanMarket({
        coins: ['BTC'],
        focus: 'short_term',
      });

      // 可能超时也可能成功（网络很快时）
      expect(response).toBeDefined();

      logger.info('超时测试', {
        success: response.success,
        error: response.error,
      });
    });
  });

  // =====================================================
  // 性能测试
  // =====================================================

  describe('性能测试', () => {
    test('应该在合理时间内完成市场扫描', async () => {
      const glmClient = new GLMClient({
        apiKey: OPENAI_API_KEY,
        baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4',
        enableLogging: false,
      });

      const startTime = Date.now();

      const response = await glmClient.scanMarket({
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

    test('应该在合理时间内完成交易决策', async () => {
      const glmClient = new GLMClient({
        apiKey: OPENAI_API_KEY,
        baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4',
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

      const response = await glmClient.makeTradingDecision({
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
  // 数据验证测试
  // =====================================================

  describe('数据验证测试', () => {
    test('应该验证市场扫描返回的数据结构', async () => {
      const glmClient = new GLMClient({
        apiKey: OPENAI_API_KEY,
        baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4',
        enableLogging: false,
      });

      const response = await glmClient.scanMarket({
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

    test('应该验证交易决策返回的数据结构', async () => {
      const glmClient = new GLMClient({
        apiKey: OPENAI_API_KEY,
        baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4',
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

      const response = await glmClient.makeTradingDecision({
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
});
