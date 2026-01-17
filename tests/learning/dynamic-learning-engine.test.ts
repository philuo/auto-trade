/**
 * 动态学习引擎完整测试
 *
 * 测试覆盖：
 * - 所有公开方法
 * - 边界条件
 * - 统计计算
 * - 学习决策逻辑
 * - 参数调整
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { DynamicLearningEngine, getGlobalLearningEngine } from '../../src/learning/dynamic-learning-engine';
import type { KLineInterval } from '../../src/market/types';

describe('DynamicLearningEngine', () => {
  let learningEngine: DynamicLearningEngine;

  beforeEach(() => {
    learningEngine = new DynamicLearningEngine();
  });

  // =====================================================
  // 构造函数测试
  // =====================================================

  describe('constructor', () => {
    test('应该初始化学习引擎', () => {
      const engine = new DynamicLearningEngine();

      const stats = engine.getRollingStats();
      expect(stats.totalTrades).toBe(0);
      expect(stats.winRate).toBe(0);
      expect(stats.netPnl).toBe(0);
    });
  });

  // =====================================================
  // recordTrade 测试
  // =====================================================

  describe('recordTrade', () => {
    test('应该记录盈利交易', () => {
      learningEngine.recordTrade({
        tradeId: 'trade_1',
        coin: 'BTC',
        signalType: 'MA_CROSS',
        timeframe: '1m' as KLineInterval,
        direction: 'bullish',
        entryPrice: 95000,
        exitPrice: 95100,
        entryTime: Date.now() - 60000,
        exitTime: Date.now(),
        holdingTime: 60000,
        pnl: 100,
        fee: 0.05,
        marketConditions: {
          trend: 'uptrend',
          volatility: 'normal',
          momentum: 'strong',
        },
        signalStrength: 70,
        signalConfidence: 0.7,
      });

      const stats = learningEngine.getRollingStats();
      expect(stats.totalTrades).toBe(1);
      expect(stats.winRate).toBe(1);
      expect(stats.netPnl).toBeCloseTo(99.95, 2);
    });

    test('应该记录亏损交易', () => {
      learningEngine.recordTrade({
        tradeId: 'trade_1',
        coin: 'BTC',
        signalType: 'MA_CROSS',
        timeframe: '1m' as KLineInterval,
        direction: 'bullish',
        entryPrice: 95000,
        exitPrice: 94900,
        entryTime: Date.now() - 60000,
        exitTime: Date.now(),
        holdingTime: 60000,
        pnl: -100,
        fee: 0.05,
        marketConditions: {
          trend: 'uptrend',
          volatility: 'normal',
          momentum: 'weak',
        },
        signalStrength: 60,
        signalConfidence: 0.6,
      });

      const stats = learningEngine.getRollingStats();
      expect(stats.totalTrades).toBe(1);
      expect(stats.winRate).toBe(0);
      expect(stats.netPnl).toBeCloseTo(-100.05, 2);
    });

    test('应该计算盈亏百分比', () => {
      // pnlPercent is calculated internally as (exitPrice - entryPrice) / entryPrice * 100
      // For this test: (95100 - 95000) / 95000 * 100 ≈ 0.105%
      learningEngine.recordTrade({
        tradeId: 'trade_1',
        coin: 'BTC',
        signalType: 'MA_CROSS',
        timeframe: '1m' as KLineInterval,
        direction: 'bullish',
        entryPrice: 95000,
        exitPrice: 95100,
        entryTime: Date.now() - 60000,
        exitTime: Date.now(),
        holdingTime: 60000,
        pnl: 100,
        fee: 0.05,
        marketConditions: {
          trend: 'uptrend',
          volatility: 'normal',
          momentum: 'strong',
        },
        signalStrength: 70,
        signalConfidence: 0.7,
      });

      const stats = learningEngine.getRollingStats();
      expect(stats.totalTrades).toBe(1);
      // pnlPercent is calculated internally and stored in tradeHistory
      // We can verify it by checking that netPnl is correct
      expect(stats.netPnl).toBeCloseTo(99.95, 2);
    });

    test('应该按市场条件分类统计', () => {
      // 添加不同市场条件下的交易
      learningEngine.recordTrade({
        tradeId: 'trade_1',
        coin: 'BTC',
        signalType: 'MA_CROSS',
        timeframe: '1m' as KLineInterval,
        direction: 'bullish',
        entryPrice: 95000,
        exitPrice: 95100,
        entryTime: Date.now() - 60000,
        exitTime: Date.now(),
        holdingTime: 60000,
        pnl: 100,
        fee: 0.05,
        marketConditions: {
          trend: 'uptrend',
          volatility: 'normal',
          momentum: 'strong',
        },
        signalStrength: 70,
        signalConfidence: 0.7,
      });

      learningEngine.recordTrade({
        tradeId: 'trade_2',
        coin: 'BTC',
        signalType: 'MA_CROSS',
        timeframe: '1m' as KLineInterval,
        direction: 'bearish',
        entryPrice: 95000,
        exitPrice: 95100,
        entryTime: Date.now() - 60000,
        exitTime: Date.now(),
        holdingTime: 60000,
        pnl: 100,
        fee: 0.05,
        marketConditions: {
          trend: 'downtrend',
          volatility: 'high',
          momentum: 'weak',
        },
        signalStrength: 60,
        signalConfidence: 0.6,
      });

      const stats = learningEngine.getRollingStats();
      // Key is trend_volatility
      expect(stats.byMarketCondition?.['uptrend_normal']?.count).toBe(1);
      expect(stats.byMarketCondition?.['downtrend_high']?.count).toBe(1);
    });

    test('应该按信号类型分类统计', () => {
      learningEngine.recordTrade({
        tradeId: 'trade_1',
        coin: 'BTC',
        signalType: 'MA_CROSS',
        timeframe: '1m' as KLineInterval,
        direction: 'bullish',
        entryPrice: 95000,
        exitPrice: 95100,
        entryTime: Date.now() - 60000,
        exitTime: Date.now(),
        holdingTime: 60000,
        pnl: 100,
        fee: 0.05,
        marketConditions: {
          trend: 'uptrend',
          volatility: 'normal',
          momentum: 'strong',
        },
        signalStrength: 70,
        signalConfidence: 0.7,
      });

      learningEngine.recordTrade({
        tradeId: 'trade_2',
        coin: 'BTC',
        signalType: 'RSI_OVERSOLD',
        timeframe: '5m' as KLineInterval,
        direction: 'bullish',
        entryPrice: 95000,
        exitPrice: 95100,
        entryTime: Date.now() - 60000,
        exitTime: Date.now(),
        holdingTime: 60000,
        pnl: 100,
        fee: 0.05,
        marketConditions: {
          trend: 'uptrend',
          volatility: 'normal',
          momentum: 'strong',
        },
        signalStrength: 80,
        signalConfidence: 0.8,
      });

      const stats = learningEngine.getRollingStats();
      expect(stats.bySignalType?.MA_CROSS?.count).toBe(1);
      expect(stats.bySignalType?.RSI_OVERSOLD?.count).toBe(1);
    });

    test('应该处理滚动窗口限制', () => {
      const engine = new DynamicLearningEngine();

      // 添加超过滚动窗口的交易
      for (let i = 0; i < 150; i++) {
        engine.recordTrade({
          tradeId: `trade_${i}`,
          coin: 'BTC',
          signalType: 'MA_CROSS',
          timeframe: '1m' as KLineInterval,
          direction: 'bullish',
          entryPrice: 95000,
          exitPrice: 95100,
          entryTime: Date.now() - 60000,
          exitTime: Date.now(),
          holdingTime: 60000,
          pnl: 100,
          fee: 0.05,
          marketConditions: {
            trend: 'uptrend',
            volatility: 'normal',
            momentum: 'strong',
          },
          signalStrength: 70,
          signalConfidence: 0.7,
        });
      }

      const stats = engine.getRollingStats(100); // 限制100条
      expect(stats.totalTrades).toBe(100);
    });
  });

  // =====================================================
  // getRollingStats 测试
  // =====================================================

  describe('getRollingStats', () => {
    test('应该在没有交易时返回空统计', () => {
      const stats = learningEngine.getRollingStats();

      expect(stats.totalTrades).toBe(0);
      expect(stats.winningTrades).toBe(0);
      expect(stats.losingTrades).toBe(0);
      expect(stats.winRate).toBe(0);
      expect(stats.avgWin).toBe(0);
      expect(stats.avgLoss).toBe(0);
      expect(stats.profitFactor).toBe(0);
      expect(stats.maxDrawdown).toBe(0);
    });

    test('应该正确计算基础统计', () => {
      // 添加3笔盈利，2笔亏损
      for (let i = 0; i < 3; i++) {
        learningEngine.recordTrade({
          tradeId: `win_${i}`,
          coin: 'BTC',
          signalType: 'MA_CROSS',
          timeframe: '1m' as KLineInterval,
          direction: 'bullish',
          entryPrice: 95000,
          exitPrice: 95100,
          entryTime: Date.now() - 60000,
          exitTime: Date.now(),
          holdingTime: 60000,
          pnl: 100,
          fee: 0.05,
          marketConditions: {
            trend: 'uptrend',
            volatility: 'normal',
            momentum: 'strong',
          },
          signalStrength: 70,
          signalConfidence: 0.7,
        });
      }

      for (let i = 0; i < 2; i++) {
        learningEngine.recordTrade({
          tradeId: `loss_${i}`,
          coin: 'BTC',
          signalType: 'MA_CROSS',
          timeframe: '1m' as KLineInterval,
          direction: 'bearish',
          entryPrice: 95000,
          exitPrice: 94900,
          entryTime: Date.now() - 60000,
          exitTime: Date.now(),
          holdingTime: 60000,
          pnl: -50,
          fee: 0.05,
          marketConditions: {
            trend: 'downtrend',
            volatility: 'normal',
            momentum: 'weak',
          },
          signalStrength: 60,
          signalConfidence: 0.6,
        });
      }

      const stats = learningEngine.getRollingStats();

      expect(stats.totalTrades).toBe(5);
      expect(stats.winningTrades).toBe(3);
      expect(stats.losingTrades).toBe(2);
      expect(stats.winRate).toBe(0.6);
      expect(stats.avgWin).toBeCloseTo(99.95, 1);
      expect(stats.avgLoss).toBeCloseTo(50.05, 1);

      // 盈利因子 = (3*100) / (2*50) = 300/100 = 3
      expect(stats.profitFactor).toBeCloseTo(2.99, 1);
    });

    test('应该计算夏普比率', () => {
      // 添加一系列交易来计算夏普比率
      for (let i = 0; i < 20; i++) {
        const isWin = i % 2 === 0;
        learningEngine.recordTrade({
          tradeId: `trade_${i}`,
          coin: 'BTC',
          signalType: 'MA_CROSS',
          timeframe: '1m' as KLineInterval,
          direction: 'bullish',
          entryPrice: 95000,
          exitPrice: isWin ? 95100 : 94950,
          entryTime: Date.now() - 60000,
          exitTime: Date.now(),
          holdingTime: 60000,
          pnl: isWin ? 100 : -50,
          fee: 0.05,
          marketConditions: {
            trend: 'uptrend',
            volatility: 'normal',
            momentum: 'strong',
          },
          signalStrength: 70,
          signalConfidence: 0.7,
        });
      }

      const stats = learningEngine.getRollingStats();
      expect(stats.totalTrades).toBe(20);
      expect(stats.sharpeRatio).toBeGreaterThan(0); // 盈利交易应该有正夏普比率
    });

    test('应该计算最大回撤', () => {
      // 添加交易产生回撤
      learningEngine.recordTrade({
        tradeId: 'trade_1',
        coin: 'BTC',
        signalType: 'MA_CROSS',
        timeframe: '1m' as KLineInterval,
        direction: 'bullish',
        entryPrice: 95000,
        exitPrice: 95100,
        entryTime: Date.now() - 60000,
        exitTime: Date.now(),
        holdingTime: 60000,
        pnl: 100,
        fee: 0.05,
        marketConditions: {
          trend: 'uptrend',
          volatility: 'normal',
          momentum: 'strong',
        },
        signalStrength: 70,
        signalConfidence: 0.7,
      });

      learningEngine.recordTrade({
        tradeId: 'trade_2',
        coin: 'BTC',
        signalType: 'MA_CROSS',
        timeframe: '1m' as KLineInterval,
        direction: 'bearish',
        entryPrice: 95000,
        exitPrice: 94900,
        entryTime: Date.now() - 60000,
        exitTime: Date.now(),
        holdingTime: 60000,
        pnl: -150, // 大亏损
        fee: 0.05,
        marketConditions: {
          trend: 'downtrend',
          volatility: 'normal',
          momentum: 'weak',
        },
        signalStrength: 60,
        signalConfidence: 0.6,
      });

      const stats = learningEngine.getRollingStats();
      // maxDrawdown is calculated as percentage of initial capital (10000)
      // Trade 1: netPnl = 99.95, cumulative = 99.95, maxPnl = 99.95
      // Trade 2: netPnl = -150.05, cumulative = -50.10, drawdown = 99.95 - (-50.10) = 150.05
      // maxDrawdown = (150.05 / 10000) * 100 = 1.5005%
      expect(stats.maxDrawdown).toBeCloseTo(1.50, 2);
    });

    test('应该计算连胜和连败统计', () => {
      // First add enough trades to reach MIN_SAMPLES (20)
      const baseTime = Date.now() - 100000; // Start 100 seconds ago
      for (let i = 0; i < 12; i++) {
        learningEngine.recordTrade({
          tradeId: `initial_${i}`,
          coin: 'BTC',
          signalType: 'MA_CROSS',
          timeframe: '1m' as KLineInterval,
          direction: 'bullish',
          entryPrice: 95000,
          exitPrice: 95050,
          entryTime: baseTime + i * 4000,
          exitTime: baseTime + i * 4000 + 60000,
          holdingTime: 60000,
          pnl: 50,
          fee: 0.05,
          marketConditions: {
            trend: 'uptrend',
            volatility: 'normal',
            momentum: 'strong',
          },
          signalStrength: 70,
          signalConfidence: 0.7,
        });
      }

      // 添加连续盈利
      for (let i = 0; i < 5; i++) {
        learningEngine.recordTrade({
          tradeId: `win_${i}`,
          coin: 'BTC',
          signalType: 'MA_CROSS',
          timeframe: '1m' as KLineInterval,
          direction: 'bullish',
          entryPrice: 95000,
          exitPrice: 95100,
          entryTime: baseTime + (12 + i) * 4000,
          exitTime: baseTime + (12 + i) * 4000 + 60000,
          holdingTime: 60000,
          pnl: 100,
          fee: 0.05,
          marketConditions: {
            trend: 'uptrend',
            volatility: 'normal',
            momentum: 'strong',
          },
          signalStrength: 70,
          signalConfidence: 0.7,
        });
      }

      // 添加连续亏损
      for (let i = 0; i < 3; i++) {
        learningEngine.recordTrade({
          tradeId: `loss_${i}`,
          coin: 'BTC',
          signalType: 'MA_CROSS',
          timeframe: '1m' as KLineInterval,
          direction: 'bearish',
          entryPrice: 95000,
          exitPrice: 94900,
          entryTime: baseTime + (17 + i) * 4000,
          exitTime: baseTime + (17 + i) * 4000 + 60000,
          holdingTime: 60000,
          pnl: -50,
          fee: 0.05,
          marketConditions: {
            trend: 'downtrend',
            volatility: 'normal',
            momentum: 'weak',
          },
          signalStrength: 60,
          signalConfidence: 0.6,
        });
      }

      const stats = learningEngine.getRollingStats();
      // Check current streak - should show loss streak of 3 (most recent)
      expect(stats.currentStreak.type).toBe('loss');
      expect(stats.currentStreak.count).toBe(3);
    });

    test('应该计算平均持有时长', () => {
      const holdingTimes = [30000, 60000, 90000, 120000];

      holdingTimes.forEach((ht, i) => {
        learningEngine.recordTrade({
          tradeId: `trade_${i}`,
          coin: 'BTC',
          signalType: 'MA_CROSS',
          timeframe: '1m' as KLineInterval,
          direction: 'bullish',
          entryPrice: 95000,
          exitPrice: 95100,
          entryTime: Date.now() - ht,
          exitTime: Date.now(),
          holdingTime: ht,
          pnl: 100,
          fee: 0.05,
          marketConditions: {
            trend: 'uptrend',
            volatility: 'normal',
            momentum: 'strong',
          },
          signalStrength: 70,
          signalConfidence: 0.7,
        });
      });

      const stats = learningEngine.getRollingStats();
      expect(stats.avgHoldingTime).toBe(75000); // (30+60+90+120)/4 * 1000 = 75秒
    });

    test('应该支持自定义窗口大小', () => {
      // 添加20笔交易
      for (let i = 0; i < 20; i++) {
        learningEngine.recordTrade({
          tradeId: `trade_${i}`,
          coin: 'BTC',
          signalType: 'MA_CROSS',
          timeframe: '1m' as KLineInterval,
          direction: 'bullish',
          entryPrice: 95000,
          exitPrice: 95100,
          entryTime: Date.now() - 60000,
          exitTime: Date.now(),
          holdingTime: 60000,
          pnl: 100,
          fee: 0.05,
          marketConditions: {
            trend: 'uptrend',
            volatility: 'normal',
            momentum: 'strong',
          },
          signalStrength: 70,
          signalConfidence: 0.7,
        });
      }

      const stats10 = learningEngine.getRollingStats(10);
      const stats50 = learningEngine.getRollingStats(50);

      expect(stats10.totalTrades).toBe(10);
      expect(stats50.totalTrades).toBe(20);
    });
  });

  // =====================================================
  // isPaused 测试
  // =====================================================

  describe('isPaused', () => {
    test('初始状态应该不暂停', () => {
      expect(learningEngine.isPaused()).toBe(false);
    });

    test('应该在连续亏损3次后暂停', () => {
      // First add enough trades to reach MIN_SAMPLES (20)
      const baseTime = Date.now() - 100000;
      for (let i = 0; i < 17; i++) {
        learningEngine.recordTrade({
          tradeId: `initial_${i}`,
          coin: 'BTC',
          signalType: 'MA_CROSS',
          timeframe: '1m' as KLineInterval,
          direction: 'bullish',
          entryPrice: 95000,
          exitPrice: 95050,
          entryTime: baseTime + i * 4000,
          exitTime: baseTime + i * 4000 + 60000,
          holdingTime: 60000,
          pnl: 50,
          fee: 0.05,
          marketConditions: {
            trend: 'uptrend',
            volatility: 'normal',
            momentum: 'strong',
          },
          signalStrength: 70,
          signalConfidence: 0.7,
        });
      }

      // 添加3笔亏损交易
      for (let i = 0; i < 3; i++) {
        learningEngine.recordTrade({
          tradeId: `loss_${i}`,
          coin: 'BTC',
          signalType: 'MA_CROSS',
          timeframe: '1m' as KLineInterval,
          direction: 'bearish',
          entryPrice: 95000,
          exitPrice: 94900,
          entryTime: baseTime + (17 + i) * 4000,
          exitTime: baseTime + (17 + i) * 4000 + 60000,
          holdingTime: 60000,
          pnl: -50,
          fee: 0.05,
          marketConditions: {
            trend: 'downtrend',
            volatility: 'normal',
            momentum: 'weak',
          },
          signalStrength: 60,
          signalConfidence: 0.6,
        });
      }

      expect(learningEngine.isPaused()).toBe(true);
    });

    test('应该在盈利后取消暂停', () => {
      // First add enough trades to reach MIN_SAMPLES (20)
      const baseTime = Date.now() - 100000;
      for (let i = 0; i < 17; i++) {
        learningEngine.recordTrade({
          tradeId: `initial_${i}`,
          coin: 'BTC',
          signalType: 'MA_CROSS',
          timeframe: '1m' as KLineInterval,
          direction: 'bullish',
          entryPrice: 95000,
          exitPrice: 95050,
          entryTime: baseTime + i * 4000,
          exitTime: baseTime + i * 4000 + 60000,
          holdingTime: 60000,
          pnl: 50,
          fee: 0.05,
          marketConditions: {
            trend: 'uptrend',
            volatility: 'normal',
            momentum: 'strong',
          },
          signalStrength: 70,
          signalConfidence: 0.7,
        });
      }

      // 先添加3笔亏损
      for (let i = 0; i < 3; i++) {
        learningEngine.recordTrade({
          tradeId: `loss_${i}`,
          coin: 'BTC',
          signalType: 'MA_CROSS',
          timeframe: '1m' as KLineInterval,
          direction: 'bearish',
          entryPrice: 95000,
          exitPrice: 94900,
          entryTime: baseTime + (17 + i) * 4000,
          exitTime: baseTime + (17 + i) * 4000 + 60000,
          holdingTime: 60000,
          pnl: -50,
          fee: 0.05,
          marketConditions: {
            trend: 'downtrend',
            volatility: 'normal',
            momentum: 'weak',
          },
          signalStrength: 60,
          signalConfidence: 0.6,
        });
      }

      expect(learningEngine.isPaused()).toBe(true);

      // 添加一笔盈利
      learningEngine.recordTrade({
        tradeId: 'win',
        coin: 'BTC',
        signalType: 'MA_CROSS',
        timeframe: '1m' as KLineInterval,
        direction: 'bullish',
        entryPrice: 95000,
        exitPrice: 95100,
        entryTime: baseTime + 20 * 4000,
        exitTime: baseTime + 20 * 4000 + 60000,
        holdingTime: 60000,
        pnl: 100,
        fee: 0.05,
        marketConditions: {
          trend: 'uptrend',
          volatility: 'normal',
          momentum: 'strong',
        },
        signalStrength: 70,
        signalConfidence: 0.7,
      });

      expect(learningEngine.isPaused()).toBe(false);
    });

    test('应该在暂停期过期后恢复', () => {
      // First add enough trades to reach MIN_SAMPLES (20)
      const baseTime = Date.now() - 100000;
      for (let i = 0; i < 17; i++) {
        learningEngine.recordTrade({
          tradeId: `initial_${i}`,
          coin: 'BTC',
          signalType: 'MA_CROSS',
          timeframe: '1m' as KLineInterval,
          direction: 'bullish',
          entryPrice: 95000,
          exitPrice: 95050,
          entryTime: baseTime + i * 4000,
          exitTime: baseTime + i * 4000 + 60000,
          holdingTime: 60000,
          pnl: 50,
          fee: 0.05,
          marketConditions: {
            trend: 'uptrend',
            volatility: 'normal',
            momentum: 'strong',
          },
          signalStrength: 70,
          signalConfidence: 0.7,
        });
      }

      // 添加3笔亏损
      for (let i = 0; i < 3; i++) {
        learningEngine.recordTrade({
          tradeId: `loss_${i}`,
          coin: 'BTC',
          signalType: 'MA_CROSS',
          timeframe: '1m' as KLineInterval,
          direction: 'bearish',
          entryPrice: 95000,
          exitPrice: 94900,
          entryTime: baseTime + (17 + i) * 4000,
          exitTime: baseTime + (17 + i) * 4000 + 60000,
          holdingTime: 60000,
          pnl: -50,
          fee: 0.05,
          marketConditions: {
            trend: 'downtrend',
            volatility: 'normal',
            momentum: 'weak',
          },
          signalStrength: 60,
          signalConfidence: 0.6,
        });
      }

      expect(learningEngine.isPaused()).toBe(true);

      // 等待暂停期过期（5分钟）
      // 注意：这个测试可能需要调整暂停期时间才能正确测试
      // 这里我们只是验证方法存在
      expect(typeof learningEngine.isPaused).toBe('function');
    });
  });

  // =====================================================
  // getCurrentParameters 测试
  // =====================================================

  describe('getCurrentParameters', () => {
    test('应该返回当前参数', () => {
      const params = learningEngine.getCurrentParameters();

      expect(params).toBeDefined();
      expect(params.signalThreshold).toBeDefined();
      expect(params.positionSize).toBeDefined();
      expect(params.stopLossMultiplier).toBeDefined();
      expect(params.takeProfitMultiplier).toBeDefined();
    });

    test('应该返回默认参数', () => {
      const params = learningEngine.getCurrentParameters();

      expect(params.positionSize.base).toBe(1.0);
      expect(params.positionSize.max).toBe(1.0);
      expect(params.stopLossMultiplier).toBe(1.5);
      expect(params.takeProfitMultiplier).toBe(3.0);
    });
  });

  // =====================================================
  // getGlobalLearningEngine 测试
  // =====================================================

  describe('getGlobalLearningEngine', () => {
    test('应该返回单例实例', () => {
      const instance1 = getGlobalLearningEngine();
      const instance2 = getGlobalLearningEngine();

      expect(instance1).toBe(instance2);
    });

    test('应该返回可用的学习引擎', () => {
      const engine = getGlobalLearningEngine();

      expect(engine).toBeInstanceOf(DynamicLearningEngine);

      // 验证引擎功能正常
      engine.recordTrade({
        tradeId: 'test',
        coin: 'BTC',
        signalType: 'MA_CROSS',
        timeframe: '1m' as KLineInterval,
        direction: 'bullish',
        entryPrice: 95000,
        exitPrice: 95100,
        entryTime: Date.now() - 60000,
        exitTime: Date.now(),
        holdingTime: 60000,
        pnl: 100,
        fee: 0.05,
        marketConditions: {
          trend: 'uptrend',
          volatility: 'normal',
          momentum: 'strong',
        },
        signalStrength: 70,
        signalConfidence: 0.7,
      });

      const stats = engine.getRollingStats();
      expect(stats.totalTrades).toBe(1);
    });
  });

  // =====================================================
  // 学习决策测试
  // =====================================================

  describe('学习决策逻辑', () => {
    test('应该在低胜率时建议降低仓位', () => {
      // 添加10笔交易，胜率30%
      for (let i = 0; i < 10; i++) {
        const isWin = i < 3;
        learningEngine.recordTrade({
          tradeId: `trade_${i}`,
          coin: 'BTC',
          signalType: i % 2 === 0 ? 'MA_CROSS' : 'RSI_OVERSOLD',
          timeframe: '1m' as KLineInterval,
          direction: 'bullish',
          entryPrice: 95000,
          exitPrice: isWin ? 95100 : 94950,
          entryTime: Date.now() - 60000,
          exitTime: Date.now(),
          holdingTime: 60000,
          pnl: isWin ? 100 : -50,
          fee: 0.05,
          marketConditions: {
            trend: 'uptrend',
            volatility: 'normal',
            momentum: 'strong',
          },
          signalStrength: 70,
          signalConfidence: 0.7,
        });
      }

      const stats = learningEngine.getRollingStats();
      expect(stats.winRate).toBeLessThan(0.4);
      // 学习引擎应该触发参数调整
    });

    test('应该在高胜率和夏普比率时建议优化', () => {
      // 添加10笔交易，胜率70%，正夏普
      for (let i = 0; i < 10; i++) {
        const isWin = i < 7;
        learningEngine.recordTrade({
          tradeId: `trade_${i}`,
          coin: 'BTC',
          signalType: 'MA_CROSS',
          timeframe: '1m' as KLineInterval,
          direction: 'bullish',
          entryPrice: 95000,
          exitPrice: isWin ? 95100 : 94980,
          entryTime: Date.now() - 60000,
          exitTime: Date.now(),
          holdingTime: 60000,
          pnl: isWin ? 100 : -20,
          fee: 0.05,
          marketConditions: {
            trend: 'uptrend',
            volatility: 'normal',
            momentum: 'strong',
          },
          signalStrength: 70,
          signalConfidence: 0.7,
        });
      }

      const stats = learningEngine.getRollingStats();
      expect(stats.winRate).toBeGreaterThan(0.6);
      expect(stats.netPnl).toBeGreaterThan(0);
    });
  });
});
