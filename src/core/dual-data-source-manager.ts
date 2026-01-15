/**
 * 双重数据源管理器
 *
 * 功能：
 * - WebSocket + REST API 双数据源管理
 * - 自动切换数据源（基于健康状态）
 * - WebSocket 订阅 tickers 频道
 * - REST API 定期验证（每 2 秒）
 * - 静默断线检测
 * - 数据缓存和合并
 */

import type { AllowedCoin } from '../strategies/spot-dca-grid/config/strategy-config.js';
import type { MarketData } from '../strategies/spot-dca-grid/config/types.js';
import type { WsClient } from '../websocket/client.js';
import { NetworkStateManager, type DataSourceType } from './network-state-manager.js';
import { Logger } from '../utils/logger.js';

// Re-export DataSourceType for convenience
export type { DataSourceType };

// =====================================================
// 类型定义
// =====================================================

/**
 * 配置选项
 */
export interface DualDataSourceManagerConfig {
  // REST API 轮询间隔（即使 WebSocket 正常也轮询验证）
  restPollInterval: number;           // 默认 2000ms（2 秒）

  // WebSocket 订阅配置
  enableWebSocket: boolean;            // 是否启用 WebSocket

  // 数据验证
  enableDataValidation: boolean;       // 是否启用数据验证
  priceTolerancePercent: number;       // 价格容差（%）

  // 缓存配置
  cacheEnabled: boolean;               // 是否启用缓存
  cacheTTL: number;                    // 缓存过期时间（ms）

  // 日志配置
  enableLogging: boolean;              // 是否启用日志
  logDataSourceSwitches: boolean;      // 是否记录数据源切换
}

/**
 * 数据源事件
 */
export interface DataSourceEvent {
  type: 'switch' | 'ws_data' | 'rest_data' | 'ws_disconnected' | 'ws_reconnected' | 'error';
  source: DataSourceType;
  timestamp: number;
  details?: Record<string, unknown>;
}

/**
 * 市场数据回调
 */
export type MarketDataCallback = (coin: AllowedCoin, data: MarketData, source: DataSourceType) => void;

// =====================================================
// 双重数据源管理器类
// =====================================================

export class DualDataSourceManager {
  private config: Required<DualDataSourceManagerConfig>;
  private restClient: any;  // 使用 any 以支持不同的 REST 客户端实现
  private wsClient: WsClient | null = null;
  private networkStateManager: NetworkStateManager;
  private logger: Logger;

  // 数据缓存
  private marketDataCache: Map<AllowedCoin, MarketData> = new Map();
  private wsDataCache: Map<AllowedCoin, MarketData> = new Map();
  private restDataCache: Map<AllowedCoin, MarketData> = new Map();

  // 定时器
  private restPollTimer: ReturnType<typeof setInterval> | null = null;
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;

  // 状态
  private coins: Set<AllowedCoin> = new Set();
  private activeCoins: Set<AllowedCoin> = new Set();
  private isRunning: boolean = false;
  private currentDataSource: DataSourceType = 'rest';

  // 事件监听器
  private dataCallbacks: Set<MarketDataCallback> = new Set();
  private eventListeners: Map<string, Set<(event: DataSourceEvent) => void>> = new Map();

  // WebSocket 订阅管理
  private wsSubscribedCoins: Set<AllowedCoin> = new Set();

  constructor(
    restClient: any,
    networkStateManager: NetworkStateManager,
    wsClient?: WsClient,
    config?: Partial<DualDataSourceManagerConfig>
  ) {
    this.restClient = restClient;
    this.wsClient = wsClient || null;
    this.networkStateManager = networkStateManager;
    this.logger = Logger.getInstance();

    this.config = {
      restPollInterval: 2000,           // 2 秒
      enableWebSocket: true,
      enableDataValidation: true,
      priceTolerancePercent: 0.1,       // 0.1%
      cacheEnabled: true,
      cacheTTL: 5000,                   // 5 秒
      enableLogging: true,
      logDataSourceSwitches: true,
      ...config
    };

    // 监听网络状态变化
    this.networkStateManager.on('stateChange', (event) => {
      this.handleNetworkStateChange(event);
    });

    // 监听 WebSocket 连接状态
    if (this.wsClient) {
      this.setupWebSocketListeners();
    }
  }

  // =====================================================
  // 启动和停止
  // =====================================================

  /**
   * 启动数据源管理器
   */
  async start(coins: AllowedCoin[]): Promise<void> {
    if (this.isRunning) {
      console.warn('[DualDataSourceManager] Already running');
      return;
    }

    this.coins = new Set(coins);
    this.activeCoins = new Set(coins);
    this.isRunning = true;

    // 启动 REST API 定期轮询（始终运行，即使 WebSocket 正常）
    this.startRestPolling();

    // 尝试启动 WebSocket
    if (this.config.enableWebSocket && this.wsClient) {
      await this.startWebSocket();
    }

    // 启动健康检查
    this.startHealthCheck();

    console.log(`[DualDataSourceManager] Started with ${coins.length} coins`);
  }

  /**
   * 停止数据源管理器
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    // 停止定时器
    if (this.restPollTimer) {
      clearInterval(this.restPollTimer);
      this.restPollTimer = null;
    }

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // 取消 WebSocket 订阅
    if (this.wsClient && this.wsSubscribedCoins.size > 0) {
      for (const coin of this.wsSubscribedCoins) {
        this.wsClient.unsubscribe({
          channel: 'tickers',
          instId: `${coin}-USDT`
        });
      }
      this.wsSubscribedCoins.clear();
    }

    // 清除缓存
    this.marketDataCache.clear();
    this.wsDataCache.clear();
    this.restDataCache.clear();

    // 清除币种集合
    this.coins.clear();
    this.activeCoins.clear();

    this.isRunning = false;
    console.log('[DualDataSourceManager] Stopped');
  }

  // =====================================================
  // REST API 轮询
  // =====================================================

  /**
   * 启动 REST API 轮询
   */
  private startRestPolling(): void {
    // 立即执行一次
    void this.fetchRestMarketData();

    // 定期轮询
    this.restPollTimer = setInterval(() => {
      void this.fetchRestMarketData();
    }, this.config.restPollInterval);
  }

  /**
   * 从 REST API 获取市场数据
   */
  private async fetchRestMarketData(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    const startTime = Date.now();

    for (const coin of this.activeCoins) {
      try {
        const symbol = `${coin}-USDT`;
        // getTicker 返回的是数组，取第一个元素
        const tickers = await this.restClient.getTicker(symbol);
        const ticker = Array.isArray(tickers) && tickers.length > 0 ? tickers[0] : tickers;

        if (!ticker) {
          throw new Error('No ticker data returned');
        }

        const marketData: MarketData = {
          symbol,
          coin,
          timestamp: Date.now(),
          price: parseFloat(ticker.last),
          bidPrice: parseFloat(ticker.bidPx),
          askPrice: parseFloat(ticker.askPx),
          volume24h: parseFloat(ticker.vol24h),
          change24h: parseFloat(ticker.open24h) - parseFloat(ticker.last),
          changePercent24h: parseFloat(ticker.last) > 0
            ? ((parseFloat(ticker.last) - parseFloat(ticker.open24h)) / parseFloat(ticker.open24h)) * 100
            : 0,
          high24h: parseFloat(ticker.high24h),
          low24h: parseFloat(ticker.low24h)
        };

        // 更新 REST 数据缓存
        this.restDataCache.set(coin, marketData);

        // 报告数据接收
        this.networkStateManager.reportRestDataReceived();

        // 如果 WebSocket 不健康，使用 REST 数据
        if (this.networkStateManager.shouldUseRestApi()) {
          this.updateMarketData(coin, marketData, 'rest');
        }

        // 记录 REST 数据事件
        this.emitEvent({
          type: 'rest_data',
          source: 'rest',
          timestamp: Date.now(),
          details: { coin, price: marketData.price, latency: Date.now() - startTime }
        });

      } catch (error) {
        // 报告数据失败
        this.networkStateManager.reportDataFailure('rest', error as Error);

        this.emitEvent({
          type: 'error',
          source: 'rest',
          timestamp: Date.now(),
          details: { coin, error: (error as Error).message }
        });

        if (this.config.enableLogging) {
          this.logger.error(`获取 ${coin} REST 数据失败`, { coin, error: (error as Error).message });
        }
      }
    }
  }

  // =====================================================
  // WebSocket 管理
  // =====================================================

  /**
   * 启动 WebSocket
   */
  private async startWebSocket(): Promise<void> {
    if (!this.wsClient) {
      console.warn('[DualDataSourceManager] WebSocket client not configured');
      return;
    }

    try {
      // 连接到公共频道
      await this.wsClient.connectPublic();

      // 订阅 tickers 频道
      for (const coin of this.activeCoins) {
        this.wsClient.subscribe(
          {
            channel: 'tickers',
            instId: `${coin}-USDT`
          },
          (data) => this.handleWsTickerData(coin, data)
        );
        this.wsSubscribedCoins.add(coin);
      }

      this.networkStateManager.reportWebSocketConnected();

      console.log(`[DualDataSourceManager] WebSocket started, subscribed to ${this.wsSubscribedCoins.size} tickers`);

    } catch (error) {
      this.networkStateManager.reportWebSocketDisconnected((error as Error).message);
      console.error('[DualDataSourceManager] WebSocket start failed:', error);
    }
  }

  /**
   * 设置 WebSocket 监听器
   */
  private setupWebSocketListeners(): void {
    if (!this.wsClient) {
      return;
    }

    // 连接打开
    this.wsClient.onOpen((event) => {
      console.log('[DualDataSourceManager] WebSocket opened:', event.msg);
      this.networkStateManager.reportWebSocketConnected();
    });

    // 连接关闭
    this.wsClient.onClose((event) => {
      console.warn('[DualDataSourceManager] WebSocket closed:', event.msg);
      this.networkStateManager.reportWebSocketDisconnected(event.msg);
      this.emitEvent({
        type: 'ws_disconnected',
        source: 'websocket',
        timestamp: Date.now(),
        details: { reason: event.msg }
      });
    });

    // 错误
    this.wsClient.onError((error) => {
      console.error('[DualDataSourceManager] WebSocket error:', error.message);
      this.networkStateManager.reportDataFailure('websocket', error);
      this.emitEvent({
        type: 'error',
        source: 'websocket',
        timestamp: Date.now(),
        details: { error: error.message }
      });
    });
  }

  /**
   * 处理 WebSocket ticker 数据
   */
  private handleWsTickerData(coin: AllowedCoin, data: unknown): void {
    try {
      const ticker = data as any;
      if (!ticker || !ticker.last) {
        return;
      }

      const marketData: MarketData = {
        symbol: `${coin}-USDT`,
        coin,
        timestamp: Date.now(),
        price: parseFloat(ticker.last),
        bidPrice: parseFloat(ticker.bidPx || ticker.last),
        askPrice: parseFloat(ticker.askPx || ticker.last),
        volume24h: parseFloat(ticker.volCcy24h || ticker.vol24h || '0'),
        change24h: parseFloat(ticker.open24h) - parseFloat(ticker.last),
        changePercent24h: parseFloat(ticker.last) > 0
          ? ((parseFloat(ticker.last) - parseFloat(ticker.open24h)) / parseFloat(ticker.open24h)) * 100
          : 0,
        high24h: parseFloat(ticker.high24h || ticker.last),
        low24h: parseFloat(ticker.low24h || ticker.last)
      };

      // 更新 WebSocket 数据缓存
      this.wsDataCache.set(coin, marketData);

      // 报告数据接收
      this.networkStateManager.reportWsDataReceived();

      // 如果 WebSocket 健康，使用 WebSocket 数据
      if (this.networkStateManager.isWebSocketHealthy()) {
        this.updateMarketData(coin, marketData, 'websocket');
      }

      // 记录 WebSocket 数据事件
      this.emitEvent({
        type: 'ws_data',
        source: 'websocket',
        timestamp: Date.now(),
        details: { coin, price: marketData.price }
      });

    } catch (error) {
      this.networkStateManager.reportDataFailure('websocket', error as Error);
      if (this.config.enableLogging) {
        this.logger.error(`处理 ${coin} WebSocket 数据失败`, { coin, error: (error as Error).message });
      }
    }
  }

  // =====================================================
  // 健康检查
  // =====================================================

  /**
   * 启动健康检查
   */
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, 1000); // 每秒检查一次
  }

  /**
   * 执行健康检查
   */
  private performHealthCheck(): void {
    const state = this.networkStateManager.getState();
    const previousSource = this.currentDataSource;

    // 确定应该使用的数据源
    if (this.networkStateManager.isWebSocketHealthy()) {
      this.currentDataSource = 'websocket';
    } else {
      this.currentDataSource = 'rest';
    }

    // 如果数据源切换，记录日志
    if (previousSource !== this.currentDataSource && this.config.logDataSourceSwitches) {
      this.emitEvent({
        type: 'switch',
        source: this.currentDataSource,
        timestamp: Date.now(),
        details: {
          from: previousSource,
          to: this.currentDataSource,
          reason: state.currentStatus
        }
      });

      console.log(`[DualDataSourceManager] 数据源切换: ${previousSource} → ${this.currentDataSource}`);
      this.logger.info('数据源切换', {
        from: previousSource,
        to: this.currentDataSource,
        reason: state.currentStatus,
        wsHealthy: this.networkStateManager.isWebSocketHealthy(),
        wsLastDataTime: new Date(state.lastWsDataTime).toISOString(),
        restLastDataTime: new Date(state.lastRestDataTime).toISOString()
      });
    }

    // 检查数据是否过期
    if (state.isDataStale) {
      this.logger.warn('市场数据已过期', {
        wsDataAge: Date.now() - state.lastWsDataTime,
        restDataAge: Date.now() - state.lastRestDataTime
      });
    }
  }

  // =====================================================
  // 数据更新和通知
  // =====================================================

  /**
   * 更新市场数据并通知订阅者
   */
  private updateMarketData(coin: AllowedCoin, data: MarketData, source: DataSourceType): void {
    // 数据验证
    if (this.config.enableDataValidation && !this.validateMarketData(coin, data)) {
      this.logger.warn('市场数据验证失败', { coin, source, data });
      return;
    }

    // 更新缓存
    this.marketDataCache.set(coin, data);

    // 通知订阅者
    for (const callback of this.dataCallbacks) {
      try {
        callback(coin, data, source);
      } catch (error) {
        console.error('[DualDataSourceManager] Callback error:', error);
      }
    }
  }

  /**
   * 验证市场数据
   */
  private validateMarketData(coin: AllowedCoin, data: MarketData): boolean {
    // 基本验证
    if (!data.price || data.price <= 0 || !isFinite(data.price)) {
      return false;
    }

    // 与缓存数据对比
    const cached = this.marketDataCache.get(coin);
    if (cached) {
      const priceDiff = Math.abs(data.price - cached.price) / cached.price * 100;
      if (priceDiff > this.config.priceTolerancePercent * 100) {
        // 价格变化超过容差，可能是错误数据
        this.logger.warn('价格变化过大', {
          coin,
          oldPrice: cached.price,
          newPrice: data.price,
          change: priceDiff.toFixed(2) + '%'
        });
      }
    }

    return true;
  }

  // =====================================================
  // 网络状态变化处理
  // =====================================================

  /**
   * 处理网络状态变化
   */
  private handleNetworkStateChange(event: any): void {
    const { oldState, newState, reason } = event;

    // WebSocket 重连成功
    if (oldState.wsState === 'disconnected' && newState.wsState === 'authenticated') {
      this.emitEvent({
        type: 'ws_reconnected',
        source: 'websocket',
        timestamp: Date.now(),
        details: { reason }
      });
    }

    // 记录状态变化
    if (this.config.enableLogging) {
      this.logger.info('网络状态变化', {
        oldSource: oldState.primarySource,
        newSource: newState.primarySource,
        oldStatus: oldState.currentStatus,
        newStatus: newState.currentStatus,
        reason
      });
    }
  }

  // =====================================================
  // 公共 API
  // =====================================================

  /**
   * 订阅市场数据更新
   */
  onMarketData(callback: MarketDataCallback): void {
    this.dataCallbacks.add(callback);
  }

  /**
   * 取消订阅市场数据更新
   */
  offMarketData(callback: MarketDataCallback): void {
    this.dataCallbacks.delete(callback);
  }

  /**
   * 监听事件
   */
  on(eventType: string, listener: (event: DataSourceEvent) => void): void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }
    this.eventListeners.get(eventType)!.add(listener);
  }

  /**
   * 取消监听事件
   */
  off(eventType: string, listener: (event: DataSourceEvent) => void): void {
    const listeners = this.eventListeners.get(eventType);
    if (listeners) {
      listeners.delete(listener);
    }
  }

  /**
   * 发送事件
   */
  private emitEvent(event: DataSourceEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          console.error('[DualDataSourceManager] Event listener error:', error);
        }
      }
    }
  }

  /**
   * 获取市场数据（从缓存）
   */
  getMarketData(coin: AllowedCoin): MarketData | null {
    return this.marketDataCache.get(coin) || null;
  }

  /**
   * 获取所有市场数据
   */
  getAllMarketData(): Map<AllowedCoin, MarketData> {
    return new Map(this.marketDataCache);
  }

  /**
   * 获取当前数据源
   */
  getCurrentDataSource(): DataSourceType {
    return this.currentDataSource;
  }

  /**
   * 获取网络状态
   */
  getNetworkState() {
    return this.networkStateManager.getState();
  }

  /**
   * 添加币种
   */
  async addCoin(coin: AllowedCoin): Promise<void> {
    if (this.coins.has(coin)) {
      return;
    }

    this.coins.add(coin);
    this.activeCoins.add(coin);

    // 如果 WebSocket 运行中，订阅新币种
    if (this.wsClient && this.wsSubscribedCoins.size > 0) {
      this.wsClient.subscribe(
        {
          channel: 'tickers',
          instId: `${coin}-USDT`
        },
        (data) => this.handleWsTickerData(coin, data)
      );
      this.wsSubscribedCoins.add(coin);
    }

    // 立即获取 REST 数据
    void this.fetchRestMarketData();
  }

  /**
   * 移除币种
   */
  removeCoin(coin: AllowedCoin): void {
    this.activeCoins.delete(coin);

    // 取消 WebSocket 订阅
    if (this.wsClient && this.wsSubscribedCoins.has(coin)) {
      this.wsClient.unsubscribe({
        channel: 'tickers',
        instId: `${coin}-USDT`
      });
      this.wsSubscribedCoins.delete(coin);
    }

    // 清除缓存
    this.marketDataCache.delete(coin);
    this.wsDataCache.delete(coin);
    this.restDataCache.delete(coin);
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    coins: number;
    wsSubscribed: number;
    currentSource: DataSourceType;
    wsHealthy: boolean;
    restPollInterval: number;
    cacheSize: number;
  } {
    return {
      coins: this.coins.size,
      wsSubscribed: this.wsSubscribedCoins.size,
      currentSource: this.currentDataSource,
      wsHealthy: this.networkStateManager.isWebSocketHealthy(),
      restPollInterval: this.config.restPollInterval,
      cacheSize: this.marketDataCache.size
    };
  }
}
