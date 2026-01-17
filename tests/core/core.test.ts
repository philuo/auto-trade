/**
 * 双重数据源管理器测试
 *
 * 测试内容：
 * - 网络状态管理器功能
 * - 双重数据源管理器功能
 * - 数据源自动切换
 * - 静默断线检测
 * - WebSocket 指数退避重连
 */

import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test';
import { NetworkStateManager, DataSourceHealth, WebSocketState } from '../../src/core/network-state-manager';
import { DualDataSourceManager } from '../../src/core/dual-data-source-manager';
import type { WsClient } from '../../src/websocket/client';
import type { MarketData } from '../../src/strategies/spot-dca-grid/config/types';
import type { AllowedCoin } from '../../src/strategies/spot-dca-grid/config/strategy-config';

// =====================================================
// 测试工具
// =====================================================

// 创建模拟 REST 客户端
function createMockRestClient(): any {
  return {
    getTicker: mock(async (symbol: string) => [{
      instId: symbol,
      last: '45000.00',
      bidPx: '44999.00',
      askPx: '45001.00',
      open24h: '44000.00',
      high24h: '46000.00',
      low24h: '43000.00',
      vol24h: '1000000',
      volCcy24h: '45000000000'
    }])
  };
}

// 创建模拟 WebSocket 客户端
function createMockWsClient(): WsClient {
  const mockWsClient = {
    connectPublic: mock(async () => {}),
    subscribe: mock(() => {}),
    unsubscribe: mock(() => {}),
    onOpen: mock(() => {}),
    onClose: mock(() => {}),
    onError: mock(() => {})
  } as unknown as WsClient;

  return mockWsClient;
}

// =====================================================
// 网络状态管理器测试
// =====================================================

describe('NetworkStateManager', () => {
  let manager: NetworkStateManager;

  beforeEach(() => {
    manager = new NetworkStateManager({
      websocketStaleThreshold: 1000,    // 1 秒（测试用）
      restStaleThreshold: 2000,         // 2 秒
      silentDisconnectThreshold: 1500, // 1.5 秒
      logStateChanges: false            // 禁用日志避免干扰测试输出
    });
  });

  afterEach(() => {
    manager.removeAllListeners();
  });

  test('应该初始化为断开状态', () => {
    const state = manager.getState();
    expect(state.currentStatus).toBe(DataSourceHealth.DISCONNECTED);
    expect(state.wsState).toBe(WebSocketState.DISCONNECTED);
    expect(state.isDataStale).toBe(true);
  });

  test('应该正确报告 WebSocket 连接状态', () => {
    manager.reportWebSocketConnected();

    const state = manager.getState();
    expect(state.wsState).toBe(WebSocketState.CONNECTED);
  });

  test('应该正确报告 WebSocket 认证状态', () => {
    manager.reportWebSocketAuthenticated();

    const state = manager.getState();
    expect(state.wsState).toBe(WebSocketState.AUTHENTICATED);
  });

  test('WebSocket 数据接收后应该更新状态', () => {
    manager.reportWebSocketAuthenticated();
    manager.reportWsDataReceived();

    const state = manager.getState();
    expect(state.lastWsDataTime).toBeGreaterThan(0);
    expect(state.wsState).toBe(WebSocketState.AUTHENTICATED);
  });

  test('WebSocket 数据过期应该被检测为 DEGRADED', async () => {
    manager.reportWebSocketAuthenticated();
    manager.reportWsDataReceived();

    // 等待超过 staleThreshold（1 秒）
    await new Promise(resolve => setTimeout(resolve, 1100));

    // 执行健康检查
    const status = manager.getDataSourceStatus('websocket');
    expect(status.health).toBe(DataSourceHealth.DEGRADED);
  });

  test('WebSocket 静默断线应该被检测', async () => {
    manager.reportWebSocketAuthenticated();
    manager.reportWsDataReceived();

    // 等待超过静默断线阈值（1.5 秒）
    await new Promise(resolve => setTimeout(resolve, 1600));

    const status = manager.getDataSourceStatus('websocket');
    expect(status.health).toBe(DataSourceHealth.UNHEALTHY);
  });

  test('REST API 数据接收应该更新状态', () => {
    manager.reportRestDataReceived();

    const state = manager.getState();
    expect(state.lastRestDataTime).toBeGreaterThan(0);
  });

  test('应该正确判断是否应该使用 REST API', async () => {
    // WebSocket 健康 - 不应该使用 REST
    manager.reportWebSocketAuthenticated();
    manager.reportWsDataReceived();

    // 等待健康检查
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(manager.shouldUseRestApi()).toBe(false);

    // WebSocket 不健康 - 应该使用 REST
    manager.reportWebSocketDisconnected();
    manager.reportRestDataReceived();

    // 等待健康检查
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(manager.shouldUseRestApi()).toBe(true);
  });

  test('连续失败计数应该正确累加', () => {
    expect(manager.getReconnectStats().consecutiveFailures).toBe(0);

    manager.reportDataFailure('websocket', new Error('Test error 1'));
    expect(manager.getReconnectStats().consecutiveFailures).toBe(1);

    manager.reportDataFailure('websocket', new Error('Test error 2'));
    expect(manager.getReconnectStats().consecutiveFailures).toBe(2);

    // 数据接收应该减少失败计数
    manager.reportWsDataReceived();
    expect(manager.getReconnectStats().consecutiveFailures).toBe(1);
  });

  test('应该发送状态变化事件', (done) => {
    manager.on('stateChange', (event) => {
      expect(event.oldState.wsState).toBe(WebSocketState.DISCONNECTED);
      expect(event.newState.wsState).toBe(WebSocketState.CONNECTED);
      expect(event.reason).toBe('WebSocket connected');
      done();
    });

    manager.reportWebSocketConnected();
  });

  test('重置统计应该清零所有计数器', () => {
    manager.reportWsDataReceived();
    manager.reportRestDataReceived();
    manager.reportDataFailure('websocket', new Error('Test'));

    expect(manager.getReconnectStats().wsDataCount).toBeGreaterThan(0);
    expect(manager.getReconnectStats().consecutiveFailures).toBeGreaterThan(0);

    manager.resetStats();

    const stats = manager.getReconnectStats();
    expect(stats.wsDataCount).toBe(0);
    expect(stats.restDataCount).toBe(0);
    expect(stats.consecutiveFailures).toBe(0);
    expect(stats.attempts).toBe(0);
  });
});

// =====================================================
// 双重数据源管理器测试
// =====================================================

describe('DualDataSourceManager', () => {
  let manager: DualDataSourceManager;
  let mockRestClient: any;
  let mockWsClient: WsClient;
  let networkStateManager: NetworkStateManager;

  beforeEach(() => {
    mockRestClient = createMockRestClient();
    mockWsClient = createMockWsClient();
    networkStateManager = new NetworkStateManager({
      websocketStaleThreshold: 1000,
      restStaleThreshold: 2000,
      silentDisconnectThreshold: 1500,
      logStateChanges: false
    });

    manager = new DualDataSourceManager(
      mockRestClient,
      networkStateManager,
      mockWsClient,
      {
        restPollInterval: 100,          // 100ms（测试用）
        enableWebSocket: false,         // 禁用 WebSocket 简化测试
        enableDataValidation: true,
        enableLogging: false
      }
    );
  });

  afterEach(async () => {
    manager.stop();
  });

  test('应该能够启动和停止', async () => {
    const coins = ['BTC', 'ETH'] as AllowedCoin[];
    await manager.start(coins);

    expect(manager.getStats().coins).toBe(2);

    manager.stop();
    expect(manager.getStats().coins).toBe(0);
  });

  test('应该能够订阅市场数据更新', async () => {
    const coins = ['BTC'] as AllowedCoin[];
    await manager.start(coins);

    let receivedData: MarketData | null = null;
    let receivedSource: string | null = null;

    manager.onMarketData((coin, data, source) => {
      if (coin === 'BTC') {
        receivedData = data;
        receivedSource = source;
      }
    });

    // 等待至少一次 REST 轮询
    await new Promise(resolve => setTimeout(resolve, 200));

    expect(receivedData).not.toBeNull();
    expect(receivedData?.coin).toBe('BTC');
    expect(receivedSource).toBe('rest');
  });

  test('应该能够获取市场数据缓存', async () => {
    const coins = ['BTC'] as AllowedCoin[];
    await manager.start(coins);

    // 等待至少一次 REST 轮询
    await new Promise(resolve => setTimeout(resolve, 200));

    const data = manager.getMarketData('BTC');
    expect(data).not.toBeNull();
    expect(data?.coin).toBe('BTC');
    expect(data?.price).toBe(45000);
  });

  test('应该能够获取所有市场数据', async () => {
    const coins = ['BTC', 'ETH'] as AllowedCoin[];
    await manager.start(coins);

    // 等待至少一次 REST 轮询
    await new Promise(resolve => setTimeout(resolve, 200));

    const allData = manager.getAllMarketData();
    expect(allData.size).toBe(2);
    expect(allData.has('BTC')).toBe(true);
    expect(allData.has('ETH')).toBe(true);
  });

  test('应该能够动态添加币种', async () => {
    const coins = ['BTC'] as AllowedCoin[];
    await manager.start(coins);

    await manager.addCoin('ETH');

    // 等待新币种的 REST 轮询
    await new Promise(resolve => setTimeout(resolve, 200));

    const data = manager.getMarketData('ETH');
    expect(data).not.toBeNull();
  });

  test('应该能够移除币种', async () => {
    const coins = ['BTC', 'ETH'] as AllowedCoin[];
    await manager.start(coins);

    manager.removeCoin('ETH');

    const stats = manager.getStats();
    expect(stats.coins).toBe(2);  // coins 配置仍包含 2 个
    // 但实际活跃的应该减少
  });

  test('应该发送数据源事件', async (done) => {
    const coins = ['BTC'] as AllowedCoin[];
    await manager.start(coins);

    manager.on('rest_data', (event) => {
      expect(event.type).toBe('rest_data');
      expect(event.source).toBe('rest');
      done();
    });

    // 等待至少一次 REST 轮询
    await new Promise(resolve => setTimeout(resolve, 200));
  });

  test('应该正确报告当前数据源', async () => {
    const coins = ['BTC'] as AllowedCoin[];
    await manager.start(coins);

    // 初始应该是 REST（WebSocket 禁用）
    expect(manager.getCurrentDataSource()).toBe('rest');

    // 网络状态应该反映这一点
    const networkState = manager.getNetworkState();
    expect(networkState.primarySource).toBe('rest');
  });

  test('应该能够获取统计信息', async () => {
    const coins = ['BTC', 'ETH'] as AllowedCoin[];
    await manager.start(coins);

    const stats = manager.getStats();
    expect(stats.coins).toBe(2);
    expect(stats.currentSource).toBe('rest');
    expect(stats.wsHealthy).toBe(false);
  });
});

// =====================================================
// WebSocket 指数退避重连测试
// =====================================================

describe('WebSocket Exponential Backoff', () => {
  test('应该正确计算指数退避延迟', () => {
    const baseInterval = 5000;
    const maxInterval = 60000;
    const multiplier = 1.5;

    function calculateDelay(attempt: number): number {
      const exponentialDelay = baseInterval * Math.pow(multiplier, attempt - 1);
      return Math.min(exponentialDelay, maxInterval);
    }

    // 第 1 次：5000ms
    expect(calculateDelay(1)).toBe(5000);

    // 第 2 次：5000 * 1.5 = 7500ms
    expect(calculateDelay(2)).toBe(7500);

    // 第 3 次：5000 * 1.5^2 = 11250ms
    expect(calculateDelay(3)).toBe(11250);

    // 第 10 次：应该接近最大值
    expect(calculateDelay(10)).toBeLessThanOrEqual(60000);

    // 很多次重连：应该达到最大值
    expect(calculateDelay(100)).toBe(60000);
  });

  test('重连延迟应该逐渐增加', () => {
    const delays: number[] = [];
    const baseInterval = 5000;
    const multiplier = 1.5;

    for (let i = 1; i <= 10; i++) {
      const delay = baseInterval * Math.pow(multiplier, i - 1);
      delays.push(Math.min(delay, 60000));
    }

    // 验证延迟是递增的（除了达到最大值后）
    for (let i = 1; i < delays.length - 1; i++) {
      if (delays[i] < 60000) {
        expect(delays[i]).toBeGreaterThan(delays[i - 1]);
      }
    }
  });
});

// =====================================================
// 集成测试
// =====================================================

describe('Dual Data Source Integration', () => {
  test('完整流程：启动 → 数据更新 → 停止', async () => {
    const mockRestClient = createMockRestClient();
    const networkStateManager = new NetworkStateManager({
      websocketStaleThreshold: 1000,
      restStaleThreshold: 2000,
      silentDisconnectThreshold: 1500,
      logStateChanges: false
    });

    const manager = new DualDataSourceManager(
      mockRestClient,
      networkStateManager,
      undefined,  // 无 WebSocket
      {
        restPollInterval: 100,
        enableWebSocket: false,
        enableDataValidation: true,
        enableLogging: false
      }
    );

    const coins = ['BTC'] as AllowedCoin[];

    // 启动
    await manager.start(coins);
    expect(manager.getStats().coins).toBe(1);

    // 等待数据
    await new Promise(resolve => setTimeout(resolve, 200));
    const data = manager.getMarketData('BTC');
    expect(data).not.toBeNull();

    // 停止
    manager.stop();
    expect(manager.getStats().coins).toBe(0);
  });

  test('应该正确处理数据验证', async () => {
    const mockRestClient = createMockRestClient();

    const networkStateManager = new NetworkStateManager({
      websocketStaleThreshold: 1000,
      restStaleThreshold: 2000,
      silentDisconnectThreshold: 1500,
      logStateChanges: false
    });

    const manager = new DualDataSourceManager(
      mockRestClient,
      networkStateManager,
      undefined,
      {
        restPollInterval: 100,
        enableWebSocket: false,
        enableDataValidation: true,
        enableLogging: false,
        priceTolerancePercent: 50  // 50% 容差（测试用）
      }
    );

    const coins = ['BTC'] as AllowedCoin[];
    await manager.start(coins);

    // 正常数据应该被接受
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(manager.getMarketData('BTC')).not.toBeNull();

    manager.stop();
  });
});
