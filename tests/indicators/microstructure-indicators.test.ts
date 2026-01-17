/**
 * 高频微观结构指标完整测试
 *
 * 测试覆盖：
 * - 指标计算的所有分支
 * - 边界条件
 * - 异常处理
 * - 所有公开方法
 */

import { describe, test, expect, beforeEach } from 'bun:test';
import { HighFrequencyIndicatorCalculator, getGlobalHFCalculator } from '../../src/indicators/microstructure-indicators';
import type { KLineInterval } from '../../src/market/types';
import type { OrderBookSnapshot } from '../../src/indicators/microstructure-indicators';

describe('HighFrequencyIndicatorCalculator', () => {
  let calculator: HighFrequencyIndicatorCalculator;

  beforeEach(() => {
    calculator = new HighFrequencyIndicatorCalculator();
  });

  // Helper function to build up price/volume history
  function buildHistory(coin: string, basePrice: number, count: number) {
    for (let i = 0; i < count; i++) {
      calculator.calculateMicrostructureIndicators(
        coin,
        basePrice + i * 10,
        1000 + i * 100,
        {
          bids: [[basePrice + i * 10, 100]],
          asks: [[basePrice + i * 10 + 1, 100]],
          bestBid: basePrice + i * 10,
          bestAsk: basePrice + i * 10 + 1,
          midPrice: basePrice + i * 10 + 0.5,
          timestamp: Date.now() + i * 1000,
        },
        '1m'
      );
    }
  }

  // =====================================================
  // calculateMicrostructureIndicators 测试
  // =====================================================

  describe('calculateMicrostructureIndicators', () => {
    test('应该计算完整的微观结构指标 - 正常情况', () => {
      buildHistory('BTC', 95000, 30);

      const orderBook: OrderBookSnapshot = {
        bids: [[95000, 10], [94999, 20], [94998, 30]],
        asks: [[95001, 10], [95002, 20], [95003, 30]],
        bestBid: 95000,
        bestAsk: 95001,
        midPrice: 95000.5,
        timestamp: Date.now(),
      };

      const result = calculator.calculateMicrostructureIndicators(
        'BTC',
        95300,
        1000000,
        orderBook,
        '1m'
      );

      expect(result).toBeDefined();
      expect(result.orderFlowImbalance).toBeGreaterThanOrEqual(-1);
      expect(result.orderFlowImbalance).toBeLessThanOrEqual(1);
      expect(result.priceMomentum1m).toBeDefined();
      expect(result.priceMomentum5m).toBeDefined();
      expect(result.realizedVolatility).toBeGreaterThanOrEqual(0);
      expect(result.volumeSpike).toBeGreaterThanOrEqual(0);
      expect(result.bidAskSpread).toBeGreaterThanOrEqual(0);
      expect(result.depthImbalance).toBeGreaterThanOrEqual(-1);
      expect(result.depthImbalance).toBeLessThanOrEqual(1);
      expect(result.vwapDeviation).toBeDefined();
      expect(result.compositeStrength).toBeGreaterThanOrEqual(0);
      expect(result.compositeStrength).toBeLessThanOrEqual(100);
    });

    test('应该处理空订单簿', () => {
      const emptyOrderBook: OrderBookSnapshot = {
        bids: [],
        asks: [],
        bestBid: 0,
        bestAsk: 0,
        midPrice: 95000,
        timestamp: Date.now(),
      };

      const result = calculator.calculateMicrostructureIndicators(
        'BTC',
        95000,
        1000000,
        emptyOrderBook,
        '1m'
      );

      expect(result.orderFlowImbalance).toBe(0);
      expect(result.depthImbalance).toBe(0);
      // Composite strength is based on multiple factors, check it's a valid number
      expect(result.compositeStrength).toBeGreaterThanOrEqual(0);
      expect(result.compositeStrength).toBeLessThanOrEqual(100);
    });

    test('应该处理仅有买单的订单簿', () => {
      const bidsOnlyOrderBook: OrderBookSnapshot = {
        bids: [[95000, 100], [94999, 50]],
        asks: [],
        bestBid: 95000,
        bestAsk: 0,
        midPrice: 95000,
        timestamp: Date.now(),
      };

      const result = calculator.calculateMicrostructureIndicators(
        'BTC',
        95000,
        1000000,
        bidsOnlyOrderBook,
        '1m'
      );

      expect(result.orderFlowImbalance).toBe(1); // 完全买方
      expect(result.depthImbalance).toBe(1); // 完全买方
    });

    test('应该处理仅有卖单的订单簿', () => {
      const asksOnlyOrderBook: OrderBookSnapshot = {
        bids: [],
        asks: [[95001, 100], [95002, 50]],
        bestBid: 0,
        bestAsk: 95001,
        midPrice: 95000,
        timestamp: Date.now(),
      };

      const result = calculator.calculateMicrostructureIndicators(
        'BTC',
        95000,
        1000000,
        asksOnlyOrderBook,
        '1m'
      );

      expect(result.orderFlowImbalance).toBe(-1); // 完全卖方
      expect(result.depthImbalance).toBe(-1); // 完全卖方
    });

    test('应该正确计算买卖价差', () => {
      const orderBook: OrderBookSnapshot = {
        bids: [[95000, 10]],
        asks: [[95010, 10]],
        bestBid: 95000,
        bestAsk: 95010,
        midPrice: 95005,
        timestamp: Date.now(),
      };

      const result = calculator.calculateMicrostructureIndicators(
        'BTC',
        95005,
        1000000,
        orderBook,
        '1m'
      );

      // 价差 = (95010 - 95000) / 95005 ≈ 0.0105%
      expect(result.bidAskSpread).toBeGreaterThan(0);
      expect(result.bidAskSpread).toBeLessThan(0.001);
    });

    test('应该处理零成交量', () => {
      const orderBook: OrderBookSnapshot = {
        bids: [[95000, 10]],
        asks: [[95001, 10]],
        bestBid: 95000,
        bestAsk: 95001,
        midPrice: 95000.5,
        timestamp: Date.now(),
      };

      const result = calculator.calculateMicrostructureIndicators(
        'BTC',
        95000,
        0, // 零成交量
        orderBook,
        '1m'
      );

      // With zero volume history, volumeSpike returns 1
      expect(result.volumeSpike).toBe(1);
    });

    test('应该检测成交量激增', () => {
      // Build history with small volumes
      for (let i = 0; i < 25; i++) {
        const loopOrderBook: OrderBookSnapshot = {
          bids: [[95000 + i * 10, 100]],
          asks: [[95001 + i * 10, 100]],
          bestBid: 95000 + i * 10,
          bestAsk: 95001 + i * 10,
          midPrice: 95000 + i * 10 + 0.5,
          timestamp: Date.now() + i * 1000,
        };
        calculator.calculateMicrostructureIndicators(
          'BTC',
          95000 + i * 10,
          1000, // small volume
          loopOrderBook,
          '1m'
        );
      }

      const orderBook: OrderBookSnapshot = {
        bids: [[95260, 1000]], // Large bid
        asks: [[95261, 1000]],
        bestBid: 95260,
        bestAsk: 95261,
        midPrice: 95260.5,
        timestamp: Date.now(),
      };

      const result = calculator.calculateMicrostructureIndicators(
        'BTC',
        95260,
        100000, // Large volume
        orderBook,
        '1m'
      );

      expect(result.volumeSpike).toBeGreaterThan(1); // 放量
    });
  });

  // =====================================================
  // detectPriceBreakout 测试
  // =====================================================

  describe('detectPriceBreakout', () => {
    test('应该检测向上突破', () => {
      // Build history with prices in a range (95000-95040)
      for (let i = 0; i < 25; i++) {
        const loopOrderBook: OrderBookSnapshot = {
          bids: [[95000 + (i % 5) * 10, 100]],
          asks: [[95001 + (i % 5) * 10, 100]],
          bestBid: 95000 + (i % 5) * 10,
          bestAsk: 95001 + (i % 5) * 10,
          midPrice: 95000 + (i % 5) * 10 + 0.5,
          timestamp: Date.now() + i * 1000,
        };
        calculator.calculateMicrostructureIndicators(
          'BTC',
          95000 + (i % 5) * 10, // Prices oscillate in a range
          1000,
          loopOrderBook,
          '1m'
        );
      }

      const orderBook: OrderBookSnapshot = {
        bids: [[95150, 100]], // Price breaks above range (> 95040 * 1.001 = 95095)
        asks: [[95151, 100]],
        bestBid: 95150,
        bestAsk: 95151,
        midPrice: 95150.5,
        timestamp: Date.now(),
      };

      const result = calculator.detectPriceBreakout('BTC', 95150, orderBook);

      expect(result.isBreakout).toBe(true);
      expect(result.direction).toBe('up');
      expect(result.strength).toBeGreaterThanOrEqual(0);
    });

    test('应该检测向下突破', () => {
      // Build history with prices in a range (95000-95040)
      for (let i = 0; i < 25; i++) {
        const loopOrderBook: OrderBookSnapshot = {
          bids: [[95000 + (i % 5) * 10, 100]],
          asks: [[95001 + (i % 5) * 10, 100]],
          bestBid: 95000 + (i % 5) * 10,
          bestAsk: 95001 + (i % 5) * 10,
          midPrice: 95000 + (i % 5) * 10 + 0.5,
          timestamp: Date.now() + i * 1000,
        };
        calculator.calculateMicrostructureIndicators(
          'BTC',
          95000 + (i % 5) * 10,
          1000,
          loopOrderBook,
          '1m'
        );
      }

      const orderBook: OrderBookSnapshot = {
        bids: [[94890, 100]], // Price breaks below range (< 95000 * 0.999 = 94905)
        asks: [[94891, 100]],
        bestBid: 94890,
        bestAsk: 94891,
        midPrice: 94890.5,
        timestamp: Date.now(),
      };

      const result = calculator.detectPriceBreakout('BTC', 94890, orderBook);

      expect(result.isBreakout).toBe(true);
      expect(result.direction).toBe('down');
      expect(result.strength).toBeGreaterThanOrEqual(0);
    });

    test('应该处理无突破情况', () => {
      // Add price history, prices in range
      for (let i = 0; i < 25; i++) {
        const loopOrderBook: OrderBookSnapshot = {
          bids: [[95000 + (i % 5) * 10, 100]],
          asks: [[95001 + (i % 5) * 10, 100]],
          bestBid: 95000 + (i % 5) * 10,
          bestAsk: 95001 + (i % 5) * 10,
          midPrice: 95000 + (i % 5) * 10 + 0.5,
          timestamp: Date.now() + i * 1000,
        };
        calculator.calculateMicrostructureIndicators(
          'BTC',
          95000 + (i % 5) * 10,
          1000,
          loopOrderBook,
          '1m'
        );
      }

      const orderBook: OrderBookSnapshot = {
        bids: [[95020, 100]], // Still within range
        asks: [[95021, 100]],
        bestBid: 95020,
        bestAsk: 95021,
        midPrice: 95020.5,
        timestamp: Date.now(),
      };

      const result = calculator.detectPriceBreakout('BTC', 95020, orderBook);

      expect(result.isBreakout).toBe(false);
      expect(result.strength).toBe(0);
    });

    test('应该处理价格历史不足', () => {
      const orderBook: OrderBookSnapshot = {
        bids: [[95000, 100]],
        asks: [[95001, 100]],
        bestBid: 95000,
        bestAsk: 95001,
        midPrice: 95000.5,
        timestamp: Date.now(),
      };

      const result = calculator.detectPriceBreakout('BTC', 95000, orderBook);

      expect(result.isBreakout).toBe(false);
      expect(result.strength).toBe(0);
    });
  });

  // =====================================================
  // detectVolumeSurge 测试
  // =====================================================

  describe('detectVolumeSurge', () => {
    test('应该检测成交量激增', () => {
      // Build history with normal volumes
      for (let i = 0; i < 25; i++) {
        calculator.calculateMicrostructureIndicators(
          'BTC',
          95000 + i * 10,
          1000,
          {
            bids: [[95000 + i * 10, 100]],
            asks: [[95001 + i * 10, 100]],
            bestBid: 95000 + i * 10,
            bestAsk: 95001 + i * 10,
            midPrice: 95000 + i * 10 + 0.5,
            timestamp: Date.now() + i * 1000,
          },
          '1m'
        );
      }

      const result = calculator.detectVolumeSurge('BTC', 5000); // 5x volume

      expect(result.isSurge).toBe(true);
      expect(result.ratio).toBeGreaterThan(2);
      expect(result.quality).toBeGreaterThan(0);
    });

    test('应该处理无成交量激增', () => {
      // Build history
      for (let i = 0; i < 25; i++) {
        calculator.calculateMicrostructureIndicators(
          'BTC',
          95000 + i * 10,
          1000,
          {
            bids: [[95000 + i * 10, 100]],
            asks: [[95001 + i * 10, 100]],
            bestBid: 95000 + i * 10,
            bestAsk: 95001 + i * 10,
            midPrice: 95000 + i * 10 + 0.5,
            timestamp: Date.now() + i * 1000,
          },
          '1m'
        );
      }

      const result = calculator.detectVolumeSurge('BTC', 500); // Lower than average

      expect(result.isSurge).toBe(false);
      expect(result.ratio).toBeLessThan(2);
    });

    test('应该处理第一次成交量', () => {
      const result = calculator.detectVolumeSurge('BTC', 100);

      expect(result).toBeDefined();
      expect(result.ratio).toBe(1); // No history, ratio is 1
    });
  });

  // =====================================================
  // detectMomentumReversal 测试
  // =====================================================

  describe('detectMomentumReversal', () => {
    test('应该检测向上反转', () => {
      // Build history: first down (bearish long term), then up (bullish short term)
      // Need: momentumLong < -0.1% and momentumShort > 0.25% (for confidence > 0.5)
      // Using prices that give us the required momentum
      const bearishPrices = [96000, 95800, 95600, 95400, 95200, 95000, 94900, 94800, 94700, 94600, 94500];
      const bullishPrices = [94400, 94500, 94700, 95000]; // Strong short-term up

      for (let i = 0; i < bearishPrices.length; i++) {
        calculator.calculateMicrostructureIndicators(
          'BTC',
          bearishPrices[i],
          1000,
          {
            bids: [[bearishPrices[i], 100]],
            asks: [[bearishPrices[i] + 1, 100]],
            bestBid: bearishPrices[i],
            bestAsk: bearishPrices[i] + 1,
            midPrice: bearishPrices[i] + 0.5,
            timestamp: Date.now() + i * 1000,
          },
          '1m'
        );
      }
      for (let i = 0; i < bullishPrices.length; i++) {
        calculator.calculateMicrostructureIndicators(
          'BTC',
          bullishPrices[i],
          1000,
          {
            bids: [[bullishPrices[i], 100]],
            asks: [[bullishPrices[i] + 1, 100]],
            bestBid: bullishPrices[i],
            bestAsk: bullishPrices[i] + 1,
            midPrice: bullishPrices[i] + 0.5,
            timestamp: Date.now() + (bearishPrices.length + i) * 1000,
          },
          '1m'
        );
      }

      const result = calculator.detectMomentumReversal('BTC');

      expect(result.isReversal).toBe(true);
      expect(result.from).toBe('bearish');
      expect(result.to).toBe('bullish');
      expect(result.strength).toBeGreaterThan(0);
    });

    test('应该检测向下反转', () => {
      // Build history: first up (bullish long term), then down (bearish short term)
      // Need: momentumLong > 0.1% and momentumShort < -0.25% (for confidence > 0.5)
      // For 10-period momentum > 0.1%: prices need to increase by at least 0.1% over 10 periods
      const bullishPrices = [93500, 93700, 93900, 94100, 94300, 94500, 94700, 94900, 95100, 95300, 95500];
      const bearishPrices = [95300, 95100, 94800, 94500]; // Strong short-term down

      for (let i = 0; i < bullishPrices.length; i++) {
        calculator.calculateMicrostructureIndicators(
          'BTC',
          bullishPrices[i],
          1000,
          {
            bids: [[bullishPrices[i], 100]],
            asks: [[bullishPrices[i] + 1, 100]],
            bestBid: bullishPrices[i],
            bestAsk: bullishPrices[i] + 1,
            midPrice: bullishPrices[i] + 0.5,
            timestamp: Date.now() + i * 1000,
          },
          '1m'
        );
      }
      for (let i = 0; i < bearishPrices.length; i++) {
        calculator.calculateMicrostructureIndicators(
          'BTC',
          bearishPrices[i],
          1000,
          {
            bids: [[bearishPrices[i], 100]],
            asks: [[bearishPrices[i] + 1, 100]],
            bestBid: bearishPrices[i],
            bestAsk: bearishPrices[i] + 1,
            midPrice: bearishPrices[i] + 0.5,
            timestamp: Date.now() + (bullishPrices.length + i) * 1000,
          },
          '1m'
        );
      }

      const result = calculator.detectMomentumReversal('BTC');

      expect(result.isReversal).toBe(true);
      expect(result.from).toBe('bullish');
      expect(result.to).toBe('bearish');
      expect(result.strength).toBeGreaterThan(0);
    });

    test('应该处理价格历史不足', () => {
      const result = calculator.detectMomentumReversal('BTC');

      expect(result.isReversal).toBe(false);
      expect(result.strength).toBe(0);
    });

    test('应该处理无反转情况', () => {
      // Add continuously rising prices
      for (let i = 0; i < 15; i++) {
        calculator.calculateMicrostructureIndicators(
          'BTC',
          95000 + i * 10,
          1000,
          {
            bids: [[95000 + i * 10, 100]],
            asks: [[95001 + i * 10, 100]],
            bestBid: 95000 + i * 10,
            bestAsk: 95001 + i * 10,
            midPrice: 95000 + i * 10 + 0.5,
            timestamp: Date.now() + i * 1000,
          },
          '1m'
        );
      }

      const result = calculator.detectMomentumReversal('BTC');

      expect(result.isReversal).toBe(false);
    });
  });

  // =====================================================
  // calculateRealTimeRiskMetrics 测试
  // =====================================================

  describe('calculateRealTimeRiskMetrics', () => {
    test('应该计算完整的风险指标 - 低风险情况', () => {
      // Build stable price history
      buildHistory('BTC', 95000, 30);

      const orderBook: OrderBookSnapshot = {
        bids: [[95000, 100], [94999, 100], [94998, 100]],
        asks: [[95001, 100], [95002, 100], [95003, 100]],
        bestBid: 95000,
        bestAsk: 95001,
        midPrice: 95000.5,
        timestamp: Date.now(),
      };

      const result = calculator.calculateRealTimeRiskMetrics(
        'BTC',
        orderBook,
        50, // API延迟50ms
        true, // WebSocket已连接
        0 // 订单队列为空
      );

      expect(result).toBeDefined();
      expect(result.overallRisk).toBeDefined();
      expect(result.marketRisk.liquidity).toBeDefined();
      expect(result.marketRisk.volatility).toBeDefined();
      expect(result.systemRisk.apiLatency).toBe(50);
      expect(result.systemRisk.websocketConnected).toBe(true);
      expect(result.tradeRisk.expectedSlippage).toBeGreaterThanOrEqual(0);
    });

    test('应该检测流动性风险', () => {
      const illiquidOrderBook: OrderBookSnapshot = {
        bids: [[95000, 1], [94999, 1]], // 极小单
        asks: [[95001, 1], [95002, 1]],
        bestBid: 95000,
        bestAsk: 95001,
        midPrice: 95000.5,
        timestamp: Date.now(),
      };

      const result = calculator.calculateRealTimeRiskMetrics(
        'BTC',
        illiquidOrderBook,
        50,
        true,
        0
      );

      expect(result.marketRisk.liquidity).toBe('dry');
      expect(['high', 'extreme']).toContain(result.overallRisk); // 高风险
    });

    test('应该检测系统风险 - 高API延迟', () => {
      const orderBook: OrderBookSnapshot = {
        bids: [[95000, 100]],
        asks: [[95001, 100]],
        bestBid: 95000,
        bestAsk: 95001,
        midPrice: 95000.5,
        timestamp: Date.now(),
      };

      const result = calculator.calculateRealTimeRiskMetrics(
        'BTC',
        orderBook,
        1000, // 1秒延迟
        true,
        0
      );

      expect(result.systemRisk.apiLatency).toBe(1000);
      expect(['medium', 'high', 'extreme']).toContain(result.overallRisk);
    });

    test('应该检测WebSocket断开', () => {
      const orderBook: OrderBookSnapshot = {
        bids: [[95000, 100]],
        asks: [[95001, 100]],
        bestBid: 95000,
        bestAsk: 95001,
        midPrice: 95000.5,
        timestamp: Date.now(),
      };

      const result = calculator.calculateRealTimeRiskMetrics(
        'BTC',
        orderBook,
        50,
        false, // WebSocket断开
        0
      );

      expect(result.systemRisk.websocketConnected).toBe(false);
      expect(['high', 'extreme']).toContain(result.overallRisk);
    });

    test('应该检测订单队列积压', () => {
      const orderBook: OrderBookSnapshot = {
        bids: [[95000, 100]],
        asks: [[95001, 100]],
        bestBid: 95000,
        bestAsk: 95001,
        midPrice: 95000.5,
        timestamp: Date.now(),
      };

      const result = calculator.calculateRealTimeRiskMetrics(
        'BTC',
        orderBook,
        50,
        true,
        100 // 订单队列积压
      );

      expect(result.systemRisk.orderQueueSize).toBe(100);
      expect(['medium', 'high', 'extreme']).toContain(result.overallRisk);
    });

    test('应该处理空订单簿', () => {
      const emptyOrderBook: OrderBookSnapshot = {
        bids: [],
        asks: [],
        bestBid: 0,
        bestAsk: 0,
        midPrice: 95000,
        timestamp: Date.now(),
      };

      const result = calculator.calculateRealTimeRiskMetrics(
        'BTC',
        emptyOrderBook,
        50,
        true,
        0
      );

      expect(result.marketRisk.liquidity).toBe('dry');
      expect(result.overallRisk).toBe('extreme');
    });
  });

  // =====================================================
  // clearHistory 测试
  // =====================================================

  describe('clearHistory', () => {
    test('应该清除指定币种的历史', () => {
      buildHistory('BTC', 95000, 10);
      buildHistory('ETH', 3000, 10);

      calculator.clearHistory('BTC');

      // ETH should still have history
      const orderBook: OrderBookSnapshot = {
        bids: [[3000, 100]],
        asks: [[3001, 100]],
        bestBid: 3000,
        bestAsk: 3001,
        midPrice: 3000.5,
        timestamp: Date.now(),
      };

      const result = calculator.calculateMicrostructureIndicators(
        'ETH',
        3010,
        1000,
        orderBook,
        '1m'
      );

      // Should have momentum from ETH history
      expect(result).toBeDefined();
    });

    test('应该清除所有历史', () => {
      buildHistory('BTC', 95000, 10);
      buildHistory('ETH', 3000, 10);

      calculator.clearHistory();

      const orderBook: OrderBookSnapshot = {
        bids: [[95000, 100]],
        asks: [[95001, 100]],
        bestBid: 95000,
        bestAsk: 95001,
        midPrice: 95000.5,
        timestamp: Date.now(),
      };

      const result = calculator.calculateMicrostructureIndicators(
        'BTC',
        95100,
        1000,
        orderBook,
        '1m'
      );

      // Should have no momentum without history
      expect(result.priceMomentum1m).toBe(0);
    });
  });

  // =====================================================
  // getGlobalHFCalculator 测试
  // =====================================================

  describe('getGlobalHFCalculator', () => {
    test('应该返回单例实例', () => {
      const instance1 = getGlobalHFCalculator();
      const instance2 = getGlobalHFCalculator();

      expect(instance1).toBe(instance2);
    });

    test('应该返回可用的计算器', () => {
      const calculator = getGlobalHFCalculator();

      expect(calculator).toBeInstanceOf(HighFrequencyIndicatorCalculator);

      // 验证计算器功能正常
      const orderBook: OrderBookSnapshot = {
        bids: [[95000, 10]],
        asks: [[95001, 10]],
        bestBid: 95000,
        bestAsk: 95001,
        midPrice: 95000.5,
        timestamp: Date.now(),
      };

      const result = calculator.calculateMicrostructureIndicators(
        'BTC',
        95000,
        1000000,
        orderBook,
        '1m'
      );

      expect(result).toBeDefined();
    });
  });
});
