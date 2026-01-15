/**
 * 网络状态管理器
 *
 * 功能：
 * - 全局网络状态监控
 * - 数据源状态跟踪
 * - 静默断线检测
 * - 状态变化通知
 */

import { EventEmitter } from 'events';

// =====================================================
// 类型定义
// =====================================================

/**
 * 数据源类型
 */
export type DataSourceType = 'websocket' | 'rest' | 'degraded';

/**
 * 数据源健康状态
 */
export enum DataSourceHealth {
  HEALTHY = 'healthy',           // 健康正常
  DEGRADED = 'degraded',         // 降级（数据延迟）
  UNHEALTHY = 'unhealthy',       // 不健康（数据缺失）
  DISCONNECTED = 'disconnected'  // 断开连接
}

/**
 * WebSocket 连接状态
 */
export enum WebSocketState {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  AUTHENTICATED = 'authenticated',
  DISCONNECTED = 'disconnected',
  RECONNECTING = 'reconnecting'
}

/**
 * 数据源状态
 */
export interface DataSourceStatus {
  source: DataSourceType;
  health: DataSourceHealth;
  connected: boolean;
  lastDataTime: number;          // 最后收到数据的时间戳
  lastUpdateTime: number;        // 最后更新状态的时间戳
  dataAge: number;               // 数据年龄（毫秒）
  staleThreshold: number;        // 数据过期阈值（毫秒）
}

/**
 * 网络状态概览
 */
export interface NetworkStateOverview {
  primarySource: DataSourceType;
  currentStatus: DataSourceHealth;
  wsState: WebSocketState;
  wsConnectedTime?: number;      // WebSocket 连接持续时间
  lastWsDataTime: number;        // WebSocket 最后数据时间
  lastRestDataTime: number;      // REST 最后数据时间
  isDataStale: boolean;          // 数据是否过期
  consecutiveFailures: number;   // 连续失败次数
}

/**
 * 状态变化事件
 */
export interface StateChangeEvent {
  oldState: NetworkStateOverview;
  newState: NetworkStateOverview;
  reason: string;
  timestamp: number;
}

/**
 * 配置选项
 */
export interface NetworkStateManagerConfig {
  // 数据过期阈值
  websocketStaleThreshold: number;     // WebSocket 数据过期阈值（默认 5 秒）
  restStaleThreshold: number;          // REST 数据过期阈值（默认 10 秒）

  // 静默断线检测
  silentDisconnectThreshold: number;   // 静默断线阈值（默认 8 秒无数据）

  // 失败计数
  maxConsecutiveFailures: number;      // 最大连续失败次数（默认 5 次）

  // 状态变化日志
  logStateChanges: boolean;            // 是否记录状态变化日志
}

// =====================================================
// 网络状态管理器类
// =====================================================

export class NetworkStateManager extends EventEmitter {
  private config: Required<NetworkStateManagerConfig>;
  private currentState: NetworkStateOverview;
  private wsConnectionStartTime: number = 0;
  private wsReconnectAttempts: number = 0;
  private consecutiveFailures: number = 0;

  // 数据接收跟踪
  private wsDataReceivedCount: number = 0;
  private restDataReceivedCount: number = 0;

  constructor(config?: Partial<NetworkStateManagerConfig>) {
    super();

    const now = Date.now();

    this.config = {
      websocketStaleThreshold: 5000,    // 5 秒
      restStaleThreshold: 10000,        // 10 秒
      silentDisconnectThreshold: 8000,  // 8 秒
      maxConsecutiveFailures: 5,
      logStateChanges: true,
      ...config
    };

    // 初始化状态
    this.currentState = {
      primarySource: 'rest',
      currentStatus: DataSourceHealth.DISCONNECTED,
      wsState: WebSocketState.DISCONNECTED,
      lastWsDataTime: 0,
      lastRestDataTime: 0,
      isDataStale: true,
      consecutiveFailures: 0
    };

    // 启动健康检查定时器（每秒检查一次）
    this.startHealthCheck();
  }

  // =====================================================
  // WebSocket 状态管理
  // =====================================================

  /**
   * 报告 WebSocket 连接状态变化
   */
  reportWebSocketState(state: WebSocketState): void {
    const oldState = { ...this.currentState };
    const now = Date.now();

    this.currentState.wsState = state;

    switch (state) {
      case WebSocketState.CONNECTING:
        this.currentState.wsConnectedTime = undefined;
        break;

      case WebSocketState.CONNECTED:
      case WebSocketState.AUTHENTICATED:
        if (!this.currentState.wsConnectedTime) {
          this.wsConnectionStartTime = now;
          this.currentState.wsConnectedTime = 0;
          this.wsReconnectAttempts = 0;
        }
        break;

      case WebSocketState.DISCONNECTED:
        this.currentState.wsConnectedTime = undefined;
        this.wsReconnectAttempts++;
        break;

      case WebSocketState.RECONNECTING:
        // 重连中，不改变连接时间
        break;
    }

    this.evaluateAndNotify(oldState, 'WebSocket state changed');
  }

  /**
   * 报告 WebSocket 连接成功
   */
  reportWebSocketConnected(): void {
    const oldState = { ...this.currentState };
    const now = Date.now();

    this.currentState.wsState = WebSocketState.CONNECTED;
    this.wsConnectionStartTime = now;
    this.currentState.wsConnectedTime = 0;
    this.wsReconnectAttempts = 0;
    this.consecutiveFailures = 0;

    this.evaluateAndNotify(oldState, 'WebSocket connected');
  }

  /**
   * 报告 WebSocket 认证成功
   */
  reportWebSocketAuthenticated(): void {
    const oldState = { ...this.currentState };

    this.currentState.wsState = WebSocketState.AUTHENTICATED;
    this.evaluateAndNotify(oldState, 'WebSocket authenticated');
  }

  /**
   * 报告 WebSocket 断开
   */
  reportWebSocketDisconnected(reason?: string): void {
    const oldState = { ...this.currentState };

    this.currentState.wsState = WebSocketState.DISCONNECTED;
    this.currentState.wsConnectedTime = undefined;

    // 增加失败计数
    this.consecutiveFailures++;

    this.evaluateAndNotify(oldState, reason || 'WebSocket disconnected');
  }

  /**
   * 报告 WebSocket 重连中
   */
  reportWebSocketReconnecting(attempt: number): void {
    const oldState = { ...this.currentState };

    this.currentState.wsState = WebSocketState.RECONNECTING;
    this.wsReconnectAttempts = attempt;

    this.evaluateAndNotify(oldState, `WebSocket reconnecting (attempt ${attempt})`);
  }

  // =====================================================
  // 数据接收跟踪
  // =====================================================

  /**
   * 报告接收到 WebSocket 数据
   */
  reportWsDataReceived(): void {
    const oldState = { ...this.currentState };
    const now = Date.now();

    this.currentState.lastWsDataTime = now;
    this.wsDataReceivedCount++;

    // 重置连续失败计数
    if (this.consecutiveFailures > 0) {
      this.consecutiveFailures = Math.max(0, this.consecutiveFailures - 1);
    }

    // 更新连接持续时间
    if (this.wsConnectionStartTime > 0) {
      this.currentState.wsConnectedTime = now - this.wsConnectionStartTime;
    }

    this.evaluateAndNotify(oldState, 'WebSocket data received');
  }

  /**
   * 报告接收到 REST API 数据
   */
  reportRestDataReceived(): void {
    const oldState = { ...this.currentState };
    const now = Date.now();

    this.currentState.lastRestDataTime = now;
    this.restDataReceivedCount++;

    // 重置连续失败计数
    if (this.consecutiveFailures > 0) {
      this.consecutiveFailures = Math.max(0, this.consecutiveFailures - 1);
    }

    this.evaluateAndNotify(oldState, 'REST data received');
  }

  /**
   * 报告数据请求失败
   */
  reportDataFailure(source: DataSourceType, error?: Error): void {
    const oldState = { ...this.currentState };

    this.consecutiveFailures++;
    this.currentState.consecutiveFailures = this.consecutiveFailures;

    const errorMsg = error?.message || 'Unknown error';
    this.evaluateAndNotify(oldState, `${source.toUpperCase()} data failure: ${errorMsg}`);
  }

  // =====================================================
  // 状态评估
  // =====================================================

  /**
   * 评估当前网络状态并通知
   */
  private evaluateAndNotify(oldState: NetworkStateOverview, reason: string): void {
    const now = Date.now();

    // 计算数据年龄
    const wsDataAge = this.currentState.lastWsDataTime > 0
      ? now - this.currentState.lastWsDataTime
      : Infinity;
    const restDataAge = this.currentState.lastRestDataTime > 0
      ? now - this.currentState.lastRestDataTime
      : Infinity;

    // 判断数据是否过期
    const isWsStale = wsDataAge > this.config.websocketStaleThreshold;
    const isRestStale = restDataAge > this.config.restStaleThreshold;
    const isDataStale = isWsStale && isRestStale;

    // 判断主数据源
    let primarySource: DataSourceType;
    let currentStatus: DataSourceHealth;

    if (this.currentState.wsState === WebSocketState.AUTHENTICATED && !isWsStale) {
      // WebSocket 正常且数据新鲜
      primarySource = 'websocket';
      currentStatus = DataSourceHealth.HEALTHY;
    } else if (this.currentState.wsState === WebSocketState.AUTHENTICATED && isWsStale) {
      // WebSocket 连接但数据过期（静默断线）
      primarySource = 'degraded';
      currentStatus = DataSourceHealth.DEGRADED;
      if (wsDataAge > this.config.silentDisconnectThreshold) {
        // 超过静默断线阈值，降级到 REST
        primarySource = 'rest';
        currentStatus = isRestStale ? DataSourceHealth.UNHEALTHY : DataSourceHealth.HEALTHY;
      }
    } else if (!isRestStale) {
      // WebSocket 不可用，REST 数据新鲜
      primarySource = 'rest';
      currentStatus = DataSourceHealth.HEALTHY;
    } else {
      // 所有数据源都过期
      primarySource = 'rest';
      currentStatus = DataSourceHealth.UNHEALTHY;
    }

    // 检查是否连续失败过多
    if (this.consecutiveFailures >= this.config.maxConsecutiveFailures) {
      currentStatus = DataSourceHealth.UNHEALTHY;
    }

    // 更新状态
    this.currentState.primarySource = primarySource;
    this.currentState.currentStatus = currentStatus;
    this.currentState.isDataStale = isDataStale;

    // 如果状态发生变化，发送通知
    if (this.hasStateChanged(oldState, this.currentState)) {
      const event: StateChangeEvent = {
        oldState,
        newState: { ...this.currentState },
        reason,
        timestamp: now
      };

      if (this.config.logStateChanges) {
        this.logStateChange(event);
      }

      this.emit('stateChange', event);
      this.emit('statusUpdate', this.currentState);
    }
  }

  /**
   * 检查状态是否发生变化
   */
  private hasStateChanged(old: NetworkStateOverview, current: NetworkStateOverview): boolean {
    return old.primarySource !== current.primarySource ||
           old.currentStatus !== current.currentStatus ||
           old.wsState !== current.wsState ||
           old.isDataStale !== current.isDataStale;
  }

  /**
   * 记录状态变化日志
   */
  private logStateChange(event: StateChangeEvent): void {
    const { oldState, newState, reason } = event;

    console.log(`[NetworkStateManager] 状态变化: ${reason}`);
    console.log(`  数据源: ${oldState.primarySource} → ${newState.primarySource}`);
    console.log(`  状态: ${oldState.currentStatus} → ${newState.currentStatus}`);
    console.log(`  WebSocket: ${oldState.wsState} → ${newState.wsState}`);
    console.log(`  数据过期: ${oldState.isDataStale} → ${newState.isDataStale}`);
    console.log(`  最后数据时间: WS=${new Date(newState.lastWsDataTime).toISOString()}, REST=${new Date(newState.lastRestDataTime).toISOString()}`);
  }

  // =====================================================
  // 健康检查
  // =====================================================

  /**
   * 启动健康检查定时器
   */
  private startHealthCheck(): void {
    setInterval(() => {
      const oldState = { ...this.currentState };
      this.evaluateAndNotify(oldState, 'Periodic health check');
    }, 1000); // 每秒检查一次
  }

  // =====================================================
  // 获取状态
  // =====================================================

  /**
   * 获取当前状态概览
   */
  getState(): NetworkStateOverview {
    return { ...this.currentState };
  }

  /**
   * 获取数据源状态
   */
  getDataSourceStatus(source: DataSourceType): DataSourceStatus {
    const now = Date.now();
    const lastDataTime = source === 'websocket'
      ? this.currentState.lastWsDataTime
      : this.currentState.lastRestDataTime;
    const staleThreshold = source === 'websocket'
      ? this.config.websocketStaleThreshold
      : this.config.restStaleThreshold;
    const dataAge = lastDataTime > 0 ? now - lastDataTime : Infinity;

    let health: DataSourceHealth;
    let connected: boolean;

    if (source === 'websocket') {
      connected = this.currentState.wsState === WebSocketState.AUTHENTICATED;

      // 如果未连接，直接判定为不健康
      if (!connected) {
        health = DataSourceHealth.UNHEALTHY;
      } else if (dataAge > this.config.silentDisconnectThreshold) {
        health = DataSourceHealth.UNHEALTHY;
      } else if (dataAge > this.config.websocketStaleThreshold) {
        health = DataSourceHealth.DEGRADED;
      } else {
        health = DataSourceHealth.HEALTHY;
      }
    } else {
      connected = true; // REST 总是可用的
      if (dataAge > this.config.restStaleThreshold) {
        health = DataSourceHealth.UNHEALTHY;
      } else {
        health = DataSourceHealth.HEALTHY;
      }
    }

    return {
      source,
      health,
      connected,
      lastDataTime,
      lastUpdateTime: now,
      dataAge,
      staleThreshold
    };
  }

  /**
   * 判断是否应该使用 REST API
   */
  shouldUseRestApi(): boolean {
    const status = this.getDataSourceStatus('websocket');
    return status.health !== DataSourceHealth.HEALTHY;
  }

  /**
   * 判断 WebSocket 是否健康
   */
  isWebSocketHealthy(): boolean {
    const status = this.getDataSourceStatus('websocket');
    return status.health === DataSourceHealth.HEALTHY;
  }

  /**
   * 获取重连统计
   */
  getReconnectStats(): { attempts: number; consecutiveFailures: number; wsDataCount: number; restDataCount: number } {
    return {
      attempts: this.wsReconnectAttempts,
      consecutiveFailures: this.consecutiveFailures,
      wsDataCount: this.wsDataReceivedCount,
      restDataCount: this.restDataReceivedCount
    };
  }

  /**
   * 重置统计
   */
  resetStats(): void {
    this.wsReconnectAttempts = 0;
    this.consecutiveFailures = 0;
    this.wsDataReceivedCount = 0;
    this.restDataReceivedCount = 0;
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<NetworkStateManagerConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
