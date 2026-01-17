/**
 * 高频安全管理器完整测试
 *
 * 测试覆盖：
 * - 所有公开方法
 * - 边界条件
 * - 异常处理
 * - 风险检查逻辑
 * - 持仓管理
 */

import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { HighFrequencySafetyManager, getGlobalSafetyManager } from '../../src/risk/high-frequency-safety-manager';
import type { Position } from '../../src/risk/high-frequency-safety-manager';
import type { KLineInterval } from '../../src/market/types';
import type { RealTimeRiskMetrics } from '../../src/indicators/microstructure-indicators';
import { SignalType, SignalDirection } from '../../src/types/index';

describe('HighFrequencySafetyManager', () => {
  let safetyManager: HighFrequencySafetyManager;

  beforeEach(() => {
    safetyManager = new HighFrequencySafetyManager({
      maxPositions: 3,
      maxExposure: 30,
      consecutiveLossLimit: 3,
      dailyLossLimit: 5,
    });
  });

  // =====================================================
  // 构造函数测试
  // =====================================================

  describe('constructor', () => {
    test('应该使用默认配置初始化', async () => {
      const manager = new HighFrequencySafetyManager();

      const stats = await manager.getStats();
      expect(stats.activePositions).toBe(0);
      expect(stats.consecutiveLosses).toBe(0);
    });

    test('应该使用自定义配置初始化', async () => {
      const manager = new HighFrequencySafetyManager({
        maxPositions: 5,
        maxExposure: 50,
        consecutiveLossLimit: 5,
        dailyLossLimit: 10,
      });

      const stats = await manager.getStats();
      expect(stats.activePositions).toBe(0);
    });

    test('应该启动持仓监控', async () => {
      const manager = new HighFrequencySafetyManager({
        maxPositions: 2,
        maxExposure: 20,
      });

      // 等待监控启动
      const startTime = Date.now();
      while (Date.now() - startTime < 100) {
        // 等待
      }

      const stats = await manager.getStats();
      expect(stats).toBeDefined();
    });
  });

  // =====================================================
  // checkTradeAllowed 测试
  // =====================================================

  describe('checkTradeAllowed', () => {
    test('应该允许符合所有条件的交易', async () => {
      const lowRiskMetrics: RealTimeRiskMetrics = {
        overallRisk: 'low',
        marketRisk: {
          liquidity: 'sufficient',
          volatility: 'normal',
          spread: 'normal',
        },
        systemRisk: {
          apiLatency: 50,
          websocketConnected: true,
          orderQueueSize: 0,
        },
        tradeRisk: {
          expectedSlippage: 0.01,
          fillProbability: 0.95,
          adverseSelectionRisk: 0.05,
        },
      };

      const signal = {
        id: 'test_signal',
        type: SignalType.MA_7_25_CROSSOVER,
        direction: SignalDirection.BULLISH,
        coin: 'BTC',
        timeframe: '1m' as KLineInterval,
        strength: 0.8,
        timestamp: Date.now(),
        price: 95000,
      };

      const result = await safetyManager.checkTradeAllowed(
        signal,
        lowRiskMetrics,
        100, // orderSize
        95000 // currentPrice
      );

      expect(result.allowed).toBe(true);
      expect(result.alerts).toBeDefined();
      expect(result.adjustments).toBeDefined();
    });

    test('应该拒绝流动性不足的交易', async () => {
      const illiquidRiskMetrics: RealTimeRiskMetrics = {
        overallRisk: 'high',
        marketRisk: {
          liquidity: 'dry',
          volatility: 'normal',
          spread: 'normal',
        },
        systemRisk: {
          apiLatency: 50,
          websocketConnected: true,
          orderQueueSize: 0,
        },
        tradeRisk: {
          expectedSlippage: 0.1,
          fillProbability: 0.5,
          adverseSelectionRisk: 0.3,
        },
      };

      const signal = {
        id: 'test_signal',
        type: SignalType.MA_7_25_CROSSOVER,
        direction: SignalDirection.BULLISH,
        coin: 'BTC',
        timeframe: '1m' as KLineInterval,
        strength: 0.8,
        timestamp: Date.now(),
        price: 95000,
      };

      const result = await safetyManager.checkTradeAllowed(
        signal,
        illiquidRiskMetrics,
        100,
        95000
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('流动性');
    });

    test('应该拒绝波动率极端的交易', async () => {
      const volatileRiskMetrics: RealTimeRiskMetrics = {
        overallRisk: 'extreme',
        marketRisk: {
          liquidity: 'sufficient',
          volatility: 'extreme',
          spread: 'normal',
        },
        systemRisk: {
          apiLatency: 50,
          websocketConnected: true,
          orderQueueSize: 0,
        },
        tradeRisk: {
          expectedSlippage: 0.05,
          fillProbability: 0.7,
          adverseSelectionRisk: 0.2,
        },
      };

      const signal = {
        id: 'test_signal',
        type: SignalType.MA_7_25_CROSSOVER,
        direction: SignalDirection.BULLISH,
        coin: 'BTC',
        timeframe: '1m' as KLineInterval,
        strength: 0.8,
        timestamp: Date.now(),
        price: 95000,
      };

      const result = await safetyManager.checkTradeAllowed(
        signal,
        volatileRiskMetrics,
        100,
        95000
      );

      expect(result.allowed).toBe(false);
      expect(result.alerts?.some(a => a.type === 'volatility')).toBe(true);
    });

    test('应该在达到连续亏损限制时拒绝交易', async () => {
      // 模拟连续亏损
      for (let i = 0; i < 3; i++) {
        const position = safetyManager.addPosition({
          coin: 'BTC',
          side: 'long',
          entryPrice: 95000,
          currentPrice: 94900,
          size: 0.001,
          timeframe: '1m',
          stopLoss: 94800,
          takeProfit: 95200,
          signalId: `test_${i}`,
        });

        safetyManager.closePosition(position.positionId, '测试亏损', 94900);
      }

      const lowRiskMetrics: RealTimeRiskMetrics = {
        overallRisk: 'low',
        marketRisk: {
          liquidity: 'sufficient',
          volatility: 'normal',
          spread: 'normal',
        },
        systemRisk: {
          apiLatency: 50,
          websocketConnected: true,
          orderQueueSize: 0,
        },
        tradeRisk: {
          expectedSlippage: 0.01,
          fillProbability: 0.95,
          adverseSelectionRisk: 0.05,
        },
      };

      const signal = {
        id: 'test_signal',
        type: SignalType.MA_7_25_CROSSOVER,
        direction: SignalDirection.BULLISH,
        coin: 'BTC',
        timeframe: '1m' as KLineInterval,
        strength: 0.8,
        timestamp: Date.now(),
        price: 95000,
      };

      const result = await safetyManager.checkTradeAllowed(
        signal,
        lowRiskMetrics,
        100,
        95000
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('连续亏损');
    });

    test('应该在达到持仓数量限制时拒绝交易', async () => {
      // 添加最大数量的持仓
      for (let i = 0; i < 3; i++) {
        safetyManager.addPosition({
          coin: 'BTC',
          side: 'long',
          entryPrice: 95000 + i,
          currentPrice: 95000 + i,
          size: 0.001,
          timeframe: '1m',
          stopLoss: 94900,
          takeProfit: 95200,
          signalId: `test_${i}`,
        });
      }

      const lowRiskMetrics: RealTimeRiskMetrics = {
        overallRisk: 'low',
        marketRisk: {
          liquidity: 'sufficient',
          volatility: 'normal',
          spread: 'normal',
        },
        systemRisk: {
          apiLatency: 50,
          websocketConnected: true,
          orderQueueSize: 0,
        },
        tradeRisk: {
          expectedSlippage: 0.01,
          fillProbability: 0.95,
          adverseSelectionRisk: 0.05,
        },
      };

      const signal = {
        id: 'test_signal',
        type: SignalType.MA_7_25_CROSSOVER,
        direction: SignalDirection.BULLISH,
        coin: 'ETH',
        timeframe: '1m' as KLineInterval,
        strength: 0.8,
        timestamp: Date.now(),
        price: 3000,
      };

      const result = await safetyManager.checkTradeAllowed(
        signal,
        lowRiskMetrics,
        100,
        3000
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('持仓数量');
    });

    test('应该在WebSocket断开时拒绝交易', async () => {
      const disconnectedRiskMetrics: RealTimeRiskMetrics = {
        overallRisk: 'high',
        marketRisk: {
          liquidity: 'sufficient',
          volatility: 'normal',
          spread: 'normal',
        },
        systemRisk: {
          apiLatency: 50,
          websocketConnected: false,
          orderQueueSize: 0,
        },
        tradeRisk: {
          expectedSlippage: 0.01,
          fillProbability: 0.95,
          adverseSelectionRisk: 0.05,
        },
      };

      const signal = {
        id: 'test_signal',
        type: SignalType.MA_7_25_CROSSOVER,
        direction: SignalDirection.BULLISH,
        coin: 'BTC',
        timeframe: '1m' as KLineInterval,
        strength: 0.8,
        timestamp: Date.now(),
        price: 95000,
      };

      const result = await safetyManager.checkTradeAllowed(
        signal,
        disconnectedRiskMetrics,
        100,
        95000
      );

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('WebSocket');
    });

    test('应该在API延迟过高时拒绝交易', async () => {
      const highLatencyRiskMetrics: RealTimeRiskMetrics = {
        overallRisk: 'medium',
        marketRisk: {
          liquidity: 'sufficient',
          volatility: 'normal',
          spread: 'normal',
        },
        systemRisk: {
          apiLatency: 1000, // 1秒延迟
          websocketConnected: true,
          orderQueueSize: 0,
        },
        tradeRisk: {
          expectedSlippage: 0.01,
          fillProbability: 0.95,
          adverseSelectionRisk: 0.05,
        },
      };

      const signal = {
        id: 'test_signal',
        type: SignalType.MA_7_25_CROSSOVER,
        direction: SignalDirection.BULLISH,
        coin: 'BTC',
        timeframe: '1m' as KLineInterval,
        strength: 0.8,
        timestamp: Date.now(),
        price: 95000,
      };

      const result = await safetyManager.checkTradeAllowed(
        signal,
        highLatencyRiskMetrics,
        100,
        95000
      );

      expect(result.allowed).toBe(false);
      expect(result.alerts?.some(a => a.type === 'system')).toBe(true);
    });

    test('应该在高波动率时建议降低仓位', async () => {
      const volatileRiskMetrics: RealTimeRiskMetrics = {
        overallRisk: 'medium',
        marketRisk: {
          liquidity: 'sufficient',
          volatility: 'high',
          spread: 'normal',
        },
        systemRisk: {
          apiLatency: 50,
          websocketConnected: true,
          orderQueueSize: 0,
        },
        tradeRisk: {
          expectedSlippage: 0.02,
          fillProbability: 0.9,
          adverseSelectionRisk: 0.1,
        },
      };

      const signal = {
        id: 'test_signal',
        type: SignalType.MA_7_25_CROSSOVER,
        direction: SignalDirection.BULLISH,
        coin: 'BTC',
        timeframe: '1m' as KLineInterval,
        strength: 0.8,
        timestamp: Date.now(),
        price: 95000,
      };

      const result = await safetyManager.checkTradeAllowed(
        signal,
        volatileRiskMetrics,
        100,
        95000
      );

      expect(result.allowed).toBe(true); // 高波动率允许交易
      expect(result.adjustments?.positionSize).toBeDefined();
      expect(result.adjustments?.positionSize).toBeLessThan(1); // 降低仓位
    });

    test('应该返回动态止盈止损建议', async () => {
      const lowRiskMetrics: RealTimeRiskMetrics = {
        overallRisk: 'low',
        marketRisk: {
          liquidity: 'sufficient',
          volatility: 'normal',
          spread: 'normal',
        },
        systemRisk: {
          apiLatency: 50,
          websocketConnected: true,
          orderQueueSize: 0,
        },
        tradeRisk: {
          expectedSlippage: 0.01,
          fillProbability: 0.95,
          adverseSelectionRisk: 0.05,
        },
      };

      const signal = {
        id: 'test_signal',
        type: SignalType.MA_7_25_CROSSOVER,
        direction: SignalDirection.BULLISH,
        coin: 'BTC',
        timeframe: '1m' as KLineInterval,
        strength: 0.8,
        timestamp: Date.now(),
        price: 95000,
      };

      const result = await safetyManager.checkTradeAllowed(
        signal,
        lowRiskMetrics,
        100,
        95000
      );

      expect(result.adjustments?.stopLoss).toBeDefined();
      expect(result.adjustments?.takeProfit).toBeDefined();
      expect(result.adjustments.stopLoss).toBeLessThan(95000); // 多头止损低于当前价
      expect(result.adjustments.takeProfit).toBeGreaterThan(95000); // 多头止盈高于当前价
    });
  });

  // =====================================================
  // addPosition 测试
  // =====================================================

  describe('addPosition', () => {
    test('应该成功添加新持仓', async () => {
      const position = safetyManager.addPosition({
        coin: 'BTC',
        side: 'long',
        entryPrice: 95000,
        currentPrice: 95000,
        size: 0.001,
        timeframe: '1m',
        stopLoss: 94800,
        takeProfit: 95200,
        signalId: 'test_signal',
      });

      expect(position).toBeDefined();
      expect(position.coin).toBe('BTC');
      expect(position.side).toBe('long');
      expect(position.closed).toBe(false);
      expect(position.positionId).toBeDefined();

      const stats = await safetyManager.getStats();
      expect(stats.activePositions).toBe(1);
    });

    test('应该为每个持仓生成唯一ID', () => {
      const position1 = safetyManager.addPosition({
        coin: 'BTC',
        side: 'long',
        entryPrice: 95000,
        currentPrice: 95000,
        size: 0.001,
        timeframe: '1m',
        stopLoss: 94800,
        takeProfit: 95200,
        signalId: 'test_signal',
      });

      const position2 = safetyManager.addPosition({
        coin: 'ETH',
        side: 'short',
        entryPrice: 3000,
        currentPrice: 3000,
        size: 0.1,
        timeframe: '5m',
        stopLoss: 3020,
        takeProfit: 2980,
        signalId: 'test_signal_2',
      });

      expect(position1.positionId).not.toBe(position2.positionId);
    });
  });

  // =====================================================
  // updatePositionPrice 测试
  // =====================================================

  describe('updatePositionPrice', () => {
    test('应该更新持仓价格并检查止盈止损', async () => {
      const position = safetyManager.addPosition({
        coin: 'BTC',
        side: 'long',
        entryPrice: 95000,
        currentPrice: 95000,
        size: 0.001,
        timeframe: '1m',
        stopLoss: 94800,
        takeProfit: 95200,
        signalId: 'test_signal',
      });

      // 更新价格到止损位
      safetyManager.updatePositionPrice(position.positionId, 94800);

      // 持仓应该被平仓
      const positions = safetyManager.getPositions(true);
      const updatedPosition = positions.find(p => p.positionId === position.positionId);

      expect(updatedPosition?.closed).toBe(true);
      expect(updatedPosition?.closeReason).toBe('触发止损');
    });

    test('应该在达到止盈时平仓', async () => {
      const position = safetyManager.addPosition({
        coin: 'BTC',
        side: 'long',
        entryPrice: 95000,
        currentPrice: 95000,
        size: 0.001,
        timeframe: '1m',
        stopLoss: 94800,
        takeProfit: 95200,
        signalId: 'test_signal',
      });

      // 更新价格到止盈位
      safetyManager.updatePositionPrice(position.positionId, 95200);

      const positions = safetyManager.getPositions(true);
      const updatedPosition = positions.find(p => p.positionId === position.positionId);

      expect(updatedPosition?.closed).toBe(true);
      expect(updatedPosition?.closeReason).toBe('触发止盈');
    });

    test('应该处理空头持仓的止盈止损', async () => {
      const position = safetyManager.addPosition({
        coin: 'BTC',
        side: 'short',
        entryPrice: 95000,
        currentPrice: 95000,
        size: 0.001,
        timeframe: '1m',
        stopLoss: 95200, // 空头止损高于入场价
        takeProfit: 94800, // 空头止盈低于入场价
        signalId: 'test_signal',
      });

      // 更新价格到止损位
      safetyManager.updatePositionPrice(position.positionId, 95200);

      const positions = safetyManager.getPositions(true);
      const updatedPosition = positions.find(p => p.positionId === position.positionId);

      expect(updatedPosition?.closed).toBe(true);
      expect(updatedPosition?.closeReason).toBe('触发止损');
    });

    test('应该忽略已平仓的持仓', async () => {
      const position = safetyManager.addPosition({
        coin: 'BTC',
        side: 'long',
        entryPrice: 95000,
        currentPrice: 95000,
        size: 0.001,
        timeframe: '1m',
        stopLoss: 94800,
        takeProfit: 95200,
        signalId: 'test_signal',
      });

      safetyManager.closePosition(position.positionId, '手动平仓', 95000);

      // 更新已平仓的持仓，应该不报错
      expect(() => {
        safetyManager.updatePositionPrice(position.positionId, 94700);
      }).not.toThrow();
    });
  });

  // =====================================================
  // closePosition 测试
  // =====================================================

  describe('closePosition', () => {
    test('应该成功平仓并计算盈亏', async () => {
      const position = safetyManager.addPosition({
        coin: 'BTC',
        side: 'long',
        entryPrice: 95000,
        currentPrice: 95000,
        size: 0.001,
        timeframe: '1m',
        stopLoss: 94800,
        takeProfit: 95200,
        signalId: 'test_signal',
      });

      safetyManager.closePosition(position.positionId, '手动平仓', 95100);

      const positions = safetyManager.getPositions(true);
      const closedPosition = positions.find(p => p.positionId === position.positionId);

      expect(closedPosition?.closed).toBe(true);
      expect(closedPosition?.closeReason).toBe('手动平仓');
      expect(closedPosition?.closePrice).toBe(95100);
      expect(closedPosition?.pnl).toBe(0.1); // (95100 - 95000) * 0.001 = 0.1
    });

    test('应该计算空头盈亏', async () => {
      const position = safetyManager.addPosition({
        coin: 'BTC',
        side: 'short',
        entryPrice: 95000,
        currentPrice: 95000,
        size: 0.001,
        timeframe: '1m',
        stopLoss: 95200,
        takeProfit: 94800,
        signalId: 'test_signal',
      });

      safetyManager.closePosition(position.positionId, '手动平仓', 94900);

      const positions = safetyManager.getPositions(true);
      const closedPosition = positions.find(p => p.positionId === position.positionId);

      expect(closedPosition?.pnl).toBe(0.1); // (95000 - 94900) * 0.001 = 0.1
    });

    test('应该在盈利时重置连续亏损计数', async () => {
      // 先添加亏损交易
      for (let i = 0; i < 2; i++) {
        const pos = safetyManager.addPosition({
          coin: 'BTC',
          side: 'long',
          entryPrice: 95000,
          currentPrice: 95000,
          size: 0.001,
            timeframe: '1m',
          stopLoss: 94800,
          takeProfit: 95200,
          signalId: `test_${i}`,
        });
        safetyManager.closePosition(pos.positionId, '测试', 94900);
      }

      expect((await safetyManager.getStats()).consecutiveLosses).toBe(2);

      // 添加盈利交易
      const pos = safetyManager.addPosition({
        coin: 'BTC',
        side: 'long',
        entryPrice: 95000,
        currentPrice: 95000,
        size: 0.001,
        timeframe: '1m',
        stopLoss: 94800,
        takeProfit: 95200,
        signalId: 'test_win',
      });
      safetyManager.closePosition(pos.positionId, '测试', 95100);

      expect((await safetyManager.getStats()).consecutiveLosses).toBe(0);
    });

    test('应该忽略已平仓的持仓', async () => {
      const position = safetyManager.addPosition({
        coin: 'BTC',
        side: 'long',
        entryPrice: 95000,
        currentPrice: 95000,
        size: 0.001,
        timeframe: '1m',
        stopLoss: 94800,
        takeProfit: 95200,
        signalId: 'test_signal',
      });

      safetyManager.closePosition(position.positionId, '第一次平仓', 95000);

      // 再次平仓，应该不报错
      expect(() => {
        safetyManager.closePosition(position.positionId, '第二次平仓', 95000);
      }).not.toThrow();
    });
  });

  // =====================================================
  // getPositions 测试
  // =====================================================

  describe('getPositions', () => {
    test('应该返回所有活动持仓', async () => {
      safetyManager.addPosition({
        coin: 'BTC',
        side: 'long',
        entryPrice: 95000,
        currentPrice: 95000,
        size: 0.001,
        timeframe: '1m',
        stopLoss: 94800,
        takeProfit: 95200,
        signalId: 'test_1',
      });

      safetyManager.addPosition({
        coin: 'ETH',
        side: 'short',
        entryPrice: 3000,
        currentPrice: 3000,
        size: 0.1,
        timeframe: '5m',
        stopLoss: 3020,
        takeProfit: 2980,
        signalId: 'test_2',
      });

      const positions = safetyManager.getPositions(true);
      expect(positions.length).toBe(2);
    });

    test('不应该返回已平仓的持仓', async () => {
      const position = safetyManager.addPosition({
        coin: 'BTC',
        side: 'long',
        entryPrice: 95000,
        currentPrice: 95000,
        size: 0.001,
        timeframe: '1m',
        stopLoss: 94800,
        takeProfit: 95200,
        signalId: 'test_signal',
      });

      safetyManager.closePosition(position.positionId, '测试', 95000);

      const positions = safetyManager.getPositions();
      expect(positions.length).toBe(0);
    });
  });

  // =====================================================
  // getStats 测试
  // =====================================================

  describe('getStats', () => {
    test('应该返回正确的统计信息', async () => {
      const stats = await safetyManager.getStats();

      expect(stats).toBeDefined();
      expect(stats.activePositions).toBeGreaterThanOrEqual(0);
      expect(stats.consecutiveLosses).toBeGreaterThanOrEqual(0);
      expect(stats.dailyLoss).toBeGreaterThanOrEqual(0);
      expect(stats.currentExposure).toBeGreaterThanOrEqual(0);
    });

    test('应该正确计算活动持仓数量', async () => {
      expect((await safetyManager.getStats()).activePositions).toBe(0);

      safetyManager.addPosition({
        coin: 'BTC',
        side: 'long',
        entryPrice: 95000,
        currentPrice: 95000,
        size: 0.001,
        timeframe: '1m',
        stopLoss: 94800,
        takeProfit: 95200,
        signalId: 'test_signal',
      });

      expect((await safetyManager.getStats()).activePositions).toBe(1);
    });
  });

  // =====================================================
  // resetConsecutiveLosses 测试
  // =====================================================

  describe('resetConsecutiveLosses', () => {
    test('应该重置连续亏损计数', async () => {
      // 添加亏损交易
      for (let i = 0; i < 3; i++) {
        const pos = safetyManager.addPosition({
          coin: 'BTC',
          side: 'long',
          entryPrice: 95000,
          currentPrice: 95000,
          size: 0.001,
            timeframe: '1m',
          stopLoss: 94800,
          takeProfit: 95200,
          signalId: `test_${i}`,
        });
        safetyManager.closePosition(pos.positionId, '测试', 94900);
      }

      expect((await safetyManager.getStats()).consecutiveLosses).toBe(3);

      safetyManager.resetConsecutiveLosses();

      expect((await safetyManager.getStats()).consecutiveLosses).toBe(0);
    });
  });

  // =====================================================
  // updateApiLatency 测试
  // =====================================================

  describe('updateApiLatency', () => {
    test('应该记录API延迟历史', () => {
      safetyManager.updateApiLatency(50);
      safetyManager.updateApiLatency(100);
      safetyManager.updateApiLatency(75);

      expect(safetyManager.getAverageApiLatency()).toBeCloseTo(75, 0);
    });

    test('应该限制历史记录大小', () => {
      // 添加超过限制的记录
      for (let i = 0; i < 150; i++) {
        safetyManager.updateApiLatency(50 + i);
      }

      const avgLatency = safetyManager.getAverageApiLatency();
      // 平均值应该是最近的100个记录
      expect(avgLatency).toBeGreaterThan(50);
      expect(avgLatency).toBeLessThan(200);
    });
  });

  // =====================================================
  // getAverageApiLatency 测试
  // =====================================================

  describe('getAverageApiLatency', () => {
    test('应该在没有记录时返回0', () => {
      const manager = new HighFrequencySafetyManager();
      expect(manager.getAverageApiLatency()).toBe(0);
    });

    test('应该计算正确的平均延迟', () => {
      safetyManager.updateApiLatency(100);
      safetyManager.updateApiLatency(200);
      safetyManager.updateApiLatency(300);

      expect(safetyManager.getAverageApiLatency()).toBe(200);
    });
  });

  // =====================================================
  // monitorRealTimeRisks 测试
  // =====================================================

  describe('monitorRealTimeRisks', () => {
    test('应该检测风险并返回警报', async () => {
      const highRiskMetrics: RealTimeRiskMetrics = {
        overallRisk: 'extreme',
        marketRisk: {
          liquidity: 'dry',
          volatility: 'extreme',
          spread: 'extreme',
        },
        systemRisk: {
          apiLatency: 300,
          websocketConnected: false,
          orderQueueSize: 50,
        },
        tradeRisk: {
          expectedSlippage: 0.1,
          fillProbability: 0.3,
          adverseSelectionRisk: 0.5,
        },
      };

      const alerts = await safetyManager.monitorRealTimeRisks(highRiskMetrics);

      expect(alerts.length).toBeGreaterThan(0);
      expect(alerts.some(a => a.type === 'liquidity')).toBe(true);
      expect(alerts.some(a => a.type === 'system')).toBe(true);
    });

    test('应该在低风险时不返回警报', async () => {
      const lowRiskMetrics: RealTimeRiskMetrics = {
        overallRisk: 'low',
        marketRisk: {
          liquidity: 'sufficient',
          volatility: 'normal',
          spread: 'normal',
        },
        systemRisk: {
          apiLatency: 50,
          websocketConnected: true,
          orderQueueSize: 0,
        },
        tradeRisk: {
          expectedSlippage: 0.01,
          fillProbability: 0.95,
          adverseSelectionRisk: 0.05,
        },
      };

      const alerts = await safetyManager.monitorRealTimeRisks(lowRiskMetrics);

      // 可能有一些警告级别的警报，但应该很少
      const criticalAlerts = alerts.filter(a => a.severity === 'critical');
      expect(criticalAlerts.length).toBe(0);
    });
  });

  // =====================================================
  // getGlobalSafetyManager 测试
  // =====================================================

  describe('getGlobalSafetyManager', () => {
    test('应该返回单例实例', () => {
      const instance1 = getGlobalSafetyManager();
      const instance2 = getGlobalSafetyManager();

      expect(instance1).toBe(instance2);
    });

    test('应该使用自定义配置', async () => {
      const manager = getGlobalSafetyManager({
        maxPositions: 5,
        maxExposure: 50,
      });

      const stats = await manager.getStats();
      expect(stats).toBeDefined();
    });
  });

  // =====================================================
  // calculateDynamicStopLoss 测试
  // =====================================================

  describe('calculateDynamicStopLoss', () => {
    test('应该为多头计算正确的止盈止损', () => {
      const signal = {
        id: 'test',
        type: SignalType.MA_7_25_CROSSOVER,
        direction: SignalDirection.BULLISH,
        coin: 'BTC',
        timeframe: '1m' as KLineInterval,
        strength: 0.8,
        timestamp: Date.now(),
        price: 95000,
      };

      const result = safetyManager.calculateDynamicStopLoss(signal, 95000);

      expect(result.stopLoss).toBeLessThan(95000);
      expect(result.takeProfit).toBeGreaterThan(95000);

      // 风险回报比应该接近1:2
      const risk = 95000 - result.stopLoss;
      const reward = result.takeProfit - 95000;
      expect(reward / risk).toBeCloseTo(2, 0.1);
    });

    test('应该为空头计算正确的止盈止损', () => {
      const signal = {
        id: 'test',
        type: SignalType.MA_7_25_CROSSUNDER,
        direction: SignalDirection.BEARISH,
        coin: 'BTC',
        timeframe: '1m' as KLineInterval,
        strength: 0.8,
        timestamp: Date.now(),
        price: 95000,
      };

      const result = safetyManager.calculateDynamicStopLoss(signal, 95000);

      expect(result.stopLoss).toBeGreaterThan(95000);
      expect(result.takeProfit).toBeLessThan(95000);

      const risk = result.stopLoss - 95000;
      const reward = 95000 - result.takeProfit;
      expect(reward / risk).toBeCloseTo(2, 0.1);
    });
  });
});
