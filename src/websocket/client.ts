/**
 * OKX WebSocket 客户端
 *
 * 功能：
 * - 连接管理（连接、断开、重连）
 * - 登录认证
 * - 频道订阅与取消订阅
 * - 心跳保活
 * - 消息处理与分发
 * - HTTP代理支持（Clash）
 *
 * 使用 Bun 1.3.6+ 原生 WebSocket 代理支持
 */

import { OkxAuth, loadAuthFromEnv } from '../core/auth;
import { API_ENDPOINTS } from '../core/constants;
import { logger } from '../utils/logger;
import type {
  WsClientConfig,
  ConnectionState,
  SubscribeConfig,
  Subscription,
  ChannelCallback,
  EventCallback,
  ErrorCallback,
  WsResponse,
  WsDataMessage,
  WsChannelArgs,
} from './types;

// =====================================================
// Bun WebSocket 类型扩展
// =====================================================

/**
 * Bun WebSocket 代理配置选项
 * 参考: https://bun.com/docs/runtime/http/websockets
 */
interface BunWebSocketProxyOptions {
  /** 代理 URL (http:// 或 https://) */
  proxy?: string | {
    url: string;
    headers?: Record<string, string>;
  };
}

// =====================================================
// WebSocket 客户端类
// =====================================================

export class WsClient {
  private config: WsClientConfig;
  private auth: OkxAuth;
  private publicWs: WebSocket | null = null;
  private privateWs: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private subscriptions: Map<string, Subscription> = new Map();

  // 重连管理
  private publicReconnectAttempts = 0;
  private privateReconnectAttempts = 0;
  private publicReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private privateReconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // 心跳管理
  private publicPingTimer: ReturnType<typeof setInterval> | null = null;
  private publicPongTimer: ReturnType<typeof setTimeout> | null = null;
  private privatePingTimer: ReturnType<typeof setInterval> | null = null;
  private privatePongTimer: ReturnType<typeof setTimeout> | null = null;

  // 消息队列
  private messageQueue: string[] = [];

  // 事件回调
  private onOpenCallbacks: EventCallback[] = [];
  private onCloseCallbacks: EventCallback[] = [];
  private onErrorCallbacks: ErrorCallback[] = [];

  // 代理设置
  private proxyUrl?: string;
  private timeSynced = false;

  constructor(config?: WsClientConfig) {
    if (config) {
      // 检测代理配置（支持 HTTP/HTTPS/SOCKS5）
      const hasProxyEnv = process.env.HTTP_PROXY || process.env.http_proxy ||
                          process.env.HTTPS_PROXY || process.env.https_proxy ||
                          process.env.ALL_PROXY || process.env.all_proxy ||
                          process.env.SOCKS_PROXY || process.env.socks_proxy;

      // 获取代理 URL - 优先使用配置，其次环境变量
      // 优先使用 HTTP 代理（Bun 原生支持）
      this.proxyUrl = config.proxyUrl || config.proxy ||
                     process.env.HTTP_PROXY || process.env.http_proxy ||
                     process.env.HTTPS_PROXY || process.env.https_proxy;

      // 如果没有 HTTP 代理，尝试将 SOCKS5 转换为 HTTP
      if (!this.proxyUrl && hasProxyEnv) {
        const socksProxy = process.env.ALL_PROXY || process.env.all_proxy ||
                          process.env.SOCKS_PROXY || process.env.socks_proxy;
        if (socksProxy && (socksProxy.startsWith('socks://') || socksProxy.startsWith('socks5://'))) {
          const url = new URL(socksProxy);
          this.proxyUrl = `http://${url.hostname}:${url.port}`;
          logger.info('SOCKS5 代理转换为 HTTP 代理（Clash mixed-port）', {
            original: socksProxy,
            converted: this.proxyUrl
          });
        }
      }

      if (this.proxyUrl) {
        logger.info('WebSocket 代理已启用', { proxy: this.proxyUrl });
      } else if (hasProxyEnv && !this.proxyUrl) {
        logger.warn('检测到代理环境变量但无法解析');
      }

      this.config = {
        ...config,
        proxyUrl: this.proxyUrl,
      };

      this.auth = new OkxAuth({
        apiKey: config.apiKey,
        secretKey: config.secretKey,
        passphrase: config.passphrase,
        isDemo: config.isDemo ?? true
      });
    } else {
      // 从环境变量加载配置
      const authConfig = loadAuthFromEnv();
      if (!authConfig) {
        throw new Error('Missing OKX API credentials. Please provide config or set environment variables.');
      }

      // 检测代理配置
      const hasProxyEnv = process.env.HTTP_PROXY || process.env.http_proxy ||
                          process.env.HTTPS_PROXY || process.env.https_proxy ||
                          process.env.ALL_PROXY || process.env.all_proxy ||
                          process.env.SOCKS_PROXY || process.env.socks_proxy;

      this.proxyUrl = process.env.HTTP_PROXY || process.env.http_proxy ||
                     process.env.HTTPS_PROXY || process.env.https_proxy;

      if (!this.proxyUrl && hasProxyEnv) {
        const socksProxy = process.env.ALL_PROXY || process.env.all_proxy ||
                          process.env.SOCKS_PROXY || process.env.socks_proxy;
        if (socksProxy && (socksProxy.startsWith('socks://') || socksProxy.startsWith('socks5://'))) {
          const url = new URL(socksProxy);
          this.proxyUrl = `http://${url.hostname}:${url.port}`;
          logger.info('SOCKS5 代理转换为 HTTP 代理', {
            original: socksProxy,
            converted: this.proxyUrl
          });
        }
      }

      if (this.proxyUrl) {
        logger.info('WebSocket 代理已启用', { proxy: this.proxyUrl });
      }

      this.config = {
        apiKey: authConfig.apiKey,
        secretKey: authConfig.secretKey,
        passphrase: authConfig.passphrase,
        isDemo: true,
        autoReconnect: true,
        reconnectInterval: 5000,
        maxReconnectAttempts: Infinity,
        pingInterval: 25000,
        proxyUrl: this.proxyUrl,
        useExponentialBackoff: true,
        maxReconnectInterval: 60000,
        backoffMultiplier: 1.5
      };

      this.auth = new OkxAuth(authConfig);
    }
  }

  // =====================================================
  // 私有方法
  // =====================================================

  /**
   * 创建带代理的 WebSocket 连接
   */
  private createWebSocket(url: string): WebSocket {
    const options: BunWebSocketProxyOptions = {};

    if (this.proxyUrl) {
      options.proxy = this.proxyUrl;
      logger.debug('创建带代理的 WebSocket', { url, proxy: this.proxyUrl });
    } else {
      logger.debug('创建直连 WebSocket', { url });
    }

    return new WebSocket(url, options);
  }

  /**
   * 同步服务器时间
   */
  private async ensureTimeSync(): Promise<void> {
    if (!this.timeSynced) {
      const baseUrl = this.config.isDemo ? 'https://www.okx.com/api/v5' : 'https://www.okx.com/api/v5';
      await this.auth.syncTime(baseUrl, this.proxyUrl);
      this.timeSynced = true;
    }
  }

  /**
   * 计算重连延迟（指数退避）
   */
  private getReconnectDelay(source: 'public' | 'private'): number {
    if (!this.config.useExponentialBackoff) {
      return this.config.reconnectInterval || 5000;
    }

    const maxInterval = this.config.maxReconnectInterval || 60000;
    const multiplier = this.config.backoffMultiplier || 1.5;
    const baseInterval = this.config.reconnectInterval || 5000;

    const attempts = source === 'public' ? this.publicReconnectAttempts : this.privateReconnectAttempts;
    const delay = Math.min(baseInterval * Math.pow(multiplier, attempts), maxInterval);

    logger.debug('重连延迟计算', {
      source,
      attempts,
      delay: `${Math.round(delay)}ms`
    });

    return delay;
  }

  /**
   * 处理重连
   */
  private handleReconnect(source: 'public' | 'private'): void {
    if (!this.config.autoReconnect) {
      return;
    }

    const maxAttempts = this.config.maxReconnectAttempts || Infinity;
    const attempts = source === 'public' ? this.publicReconnectAttempts : this.privateReconnectAttempts;

    if (attempts >= maxAttempts) {
      logger.warn('达到最大重连次数', { source, attempts: maxAttempts });
      return;
    }

    const delay = this.getReconnectDelay(source);
    const timer = setTimeout(() => {
      if (source === 'public') {
        this.publicReconnectTimer = null;
        this.connectPublic().catch(err => {
          logger.error('重连失败', { source, error: err.message });
        });
      } else {
        this.privateReconnectTimer = null;
        this.connectPrivate().catch(err => {
          logger.error('重连失败', { source, error: err.message });
        });
      }
    }, delay);

    if (source === 'public') {
      this.publicReconnectTimer = timer;
    } else {
      this.privateReconnectTimer = timer;
    }

    logger.info('计划重连', {
      source,
      delay: `${Math.round(delay)}ms`,
      attempts: attempts + 1
    });
  }

  /**
   * 处理消息
   */
  private handleMessage(data: string, source: 'public' | 'private'): void {
    // OKX WebSocket 发送 plain text "pong" 作为心跳响应
    if (data === 'pong') {
      logger.debug('收到 PONG', { source });
      // 重置 PONG 超时计时器
      if (source === 'public' && this.publicPongTimer) {
        clearTimeout(this.publicPongTimer);
        this.publicPongTimer = setTimeout(() => {
          logger.warn('PONG 超时，关闭连接');
          if (this.publicWs) {
            this.publicWs.close();
          }
        }, (this.config.pingInterval || 25000) * 2);
      } else if (source === 'private' && this.privatePongTimer) {
        clearTimeout(this.privatePongTimer);
        this.privatePongTimer = setTimeout(() => {
          logger.warn('PONG 超时，关闭连接');
          if (this.privateWs) {
            this.privateWs.close();
          }
        }, (this.config.pingInterval || 25000) * 2);
      }
      return;
    }

    // 调试日志：记录收到的所有消息
    logger.debug('收到 WebSocket 消息', { source, data: data.substring(0, 500) });

    try {
      const message: WsResponse = JSON.parse(data);

      // 处理事件消息
      if (message.event) {
        if (message.event === 'error') {
          logger.error('WebSocket 错误事件', {
            source,
            code: message.code,
            msg: message.msg,
            connId: message.connId
          });
        } else if (message.event === 'subscribe') {
          logger.info('订阅确认', { source, channel: message.arg?.channel, instId: message.arg?.instId });
        } else if (message.event === 'unsubscribe') {
          logger.info('取消订阅确认', { source, channel: message.arg?.channel });
        } else if (message.event === 'login') {
          logger.info('登录确认', { source, code: message.code, msg: message.msg });
        }
        return;
      }

      // 处理数据消息
      if (message.data && message.data.length > 0) {
        const dataMsg = message as WsDataMessage;
        dataMsg.data.forEach(item => {
          // 通知订阅者
          this.notifySubscription(item, source);
        });
      }
    } catch (error) {
      logger.error('消息解析失败', {
        source,
        data: data.substring(0, 200),
        error
      });
    }
  }

  /**
   * 通知订阅者
   * 注意：key 的格式必须与 subscribe() 方法中的格式一致
   */
  private notifySubscription(item: any, source: 'public' | 'private'): void {
    const channel = item.arg?.channel;
    const instId = item.arg?.instId;

    // key 格式必须与 subscribe() 方法一致
    // 有 instId: `${source}:${channel}:${instId}`
    // 无 instId: `${source}:${channel}`
    const key = instId ? `${source}:${channel}:${instId}` : `${source}:${channel}`;

    const subscription = this.subscriptions.get(key);
    if (subscription && subscription.callback) {
      try {
        subscription.callback(item);
      } catch (error) {
        logger.error('订阅回调错误', {
          key,
          error
        });
      }
    } else {
      logger.debug('未找到订阅回调', { key, channel, instId, source });
    }
  }

  /**
   * 处理消息队列
   */
  private processMessageQueue(): void {
    while (this.messageQueue.length > 0) {
      const message = this.messageQueue.shift();
      if (this.publicWs && this.publicWs.readyState === WebSocket.OPEN) {
        this.publicWs.send(message);
      } else if (this.privateWs && this.privateWs.readyState === WebSocket.OPEN) {
        this.privateWs.send(message);
      } else {
        // 重新放回队列
        this.messageQueue.unshift(message);
        break;
      }
    }
  }

  /**
   * 发送消息（支持排队）
   */
  private send(ws: WebSocket | null, data: string | object): void {
    const message = typeof data === 'string' ? data : JSON.stringify(data);

    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    } else {
      this.messageQueue.push(message);
      logger.debug('消息已排队', { queueLength: this.messageQueue.length });
    }
  }

  /**
   * 启动公共频道心跳
   * OKX WebSocket 使用 plain text "ping" 而不是 JSON {"op":"ping"}
   */
  private startPublicPing(): void {
    this.stopPublicPing();

    this.publicPingTimer = setInterval(() => {
      // OKX WebSocket 期望收到 plain text "ping" 而不是 JSON
      if (this.publicWs && this.publicWs.readyState === WebSocket.OPEN) {
        this.publicWs.send('ping');
      }
    }, this.config.pingInterval || 25000);

    // PONG 超时检测
    this.publicPongTimer = setTimeout(() => {
      logger.warn('PONG 超时，关闭连接');
      if (this.publicWs) {
        this.publicWs.close();
      }
    }, (this.config.pingInterval || 25000) * 2);
  }

  /**
   * 停止公共频道心跳
   */
  private stopPublicPing(): void {
    if (this.publicPingTimer) {
      clearInterval(this.publicPingTimer);
      this.publicPingTimer = null;
    }
    if (this.publicPongTimer) {
      clearTimeout(this.publicPongTimer);
      this.publicPongTimer = null;
    }
  }

  /**
   * 启动私有频道心跳
   * OKX WebSocket 使用 plain text "ping" 而不是 JSON {"op":"ping"}
   */
  private startPrivatePing(): void {
    this.stopPrivatePing();

    this.privatePingTimer = setInterval(() => {
      // OKX WebSocket 期望收到 plain text "ping" 而不是 JSON
      if (this.privateWs && this.privateWs.readyState === WebSocket.OPEN) {
        this.privateWs.send('ping');
      }
    }, this.config.pingInterval || 25000);

    this.privatePongTimer = setTimeout(() => {
      logger.warn('PONG 超时，关闭连接');
      if (this.privateWs) {
        this.privateWs.close();
      }
    }, (this.config.pingInterval || 25000) * 2);
  }

  /**
   * 停止私有频道心跳
   */
  private stopPrivatePing(): void {
    if (this.privatePingTimer) {
      clearInterval(this.privatePingTimer);
      this.privatePingTimer = null;
    }
    if (this.privatePongTimer) {
      clearTimeout(this.privatePongTimer);
      this.privatePongTimer = null;
    }
  }

  /**
   * 通知打开事件
   */
  private notifyOpen(event: WsResponse): void {
    this.onOpenCallbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        logger.error('打开回调错误', { error });
      }
    });
  }

  /**
   * 通知关闭事件
   */
  private notifyClose(event: WsResponse): void {
    this.onCloseCallbacks.forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        logger.error('关闭回调错误', { error });
      }
    });
  }

  /**
   * 通知错误事件
   */
  private notifyError(error: Error): void {
    this.onErrorCallbacks.forEach(callback => {
      try {
        callback(error);
      } catch (err) {
        logger.error('错误回调错误', { error: err });
      }
    });
  }

  // =====================================================
  // 公共 API
  // =====================================================

  /**
   * 连接到公共频道
   */
  async connectPublic(): Promise<void> {
    if (this.publicWs && this.publicWs.readyState === WebSocket.OPEN) {
      return;
    }

    this.publicReconnectAttempts = 0;

    // 根据是否为模拟盘选择不同的端点
    const url = this.config.isDemo ? API_ENDPOINTS.WS_PUBLIC_DEMO : API_ENDPOINTS.WS_PUBLIC;
    this.state = 'connecting';
    logger.info('连接公共频道', { url, isDemo: this.config.isDemo });

    this.publicWs = this.createWebSocket(url);

    return new Promise((resolve, reject) => {
      if (!this.publicWs) {
        return reject(new Error('WebSocket not initialized'));
      }

      this.publicWs.onopen = () => {
        this.state = 'connected';
        this.publicReconnectAttempts = 0;
        this.startPublicPing();
        this.processMessageQueue();
        this.notifyOpen({ event: 'open', msg: 'public connection opened' } as WsResponse);
        logger.info('公共频道已连接');
        resolve();
      };

      this.publicWs.onmessage = (event: MessageEvent) => {
        this.handleMessage(event.data as string, 'public');
      };

      this.publicWs.onerror = (event: Event) => {
        const error = new Error(`WebSocket error: ${event}`);
        this.notifyError(error);
        reject(error);
      };

      this.publicWs.onclose = (event: CloseEvent) => {
        this.state = 'disconnected';
        this.stopPublicPing();
        this.notifyClose({ event: 'close', msg: `public connection closed: ${event.code}` } as WsResponse);
        this.handleReconnect('public');
      };
    });
  }

  /**
   * 连接到私有频道
   */
  async connect(): Promise<void> {
    await Promise.all([
      this.connectPublic(),
      this.connectPrivate()
    ]);
  }

  /**
   * 连接到私有频道
   */
  async connectPrivate(): Promise<void> {
    if (this.privateWs && this.privateWs.readyState === WebSocket.OPEN) {
      return;
    }

    this.privateReconnectAttempts = 0;

    // 根据是否为模拟盘选择不同的端点
    const url = this.config.isDemo ? API_ENDPOINTS.WS_PRIVATE_DEMO : API_ENDPOINTS.WS_PRIVATE;
    this.state = 'connecting';

    await this.ensureTimeSync();
    logger.info('连接私有频道', { url, isDemo: this.config.isDemo });

    this.privateWs = this.createWebSocket(url);

    return new Promise((resolve, reject) => {
      if (!this.privateWs) {
        return reject(new Error('WebSocket not initialized'));
      }

      this.privateWs.onopen = () => {
        this.state = 'authenticated';
        this.privateReconnectAttempts = 0;
        this.startPrivatePing();
        this.processMessageQueue();

        // 登录
        this.login().then(() => {
          this.notifyOpen({ event: 'open', msg: 'private connection opened' } as WsResponse);
          logger.info('私有频道已连接并认证');
          resolve();
        }).catch(reject);
      };

      this.privateWs.onmessage = (event: MessageEvent) => {
        this.handleMessage(event.data as string, 'private');
      };

      this.privateWs.onerror = (event: Event) => {
        const error = new Error(`WebSocket error: ${event}`);
        this.notifyError(error);
        reject(error);
      };

      this.privateWs.onclose = (event: CloseEvent) => {
        this.state = 'disconnected';
        this.stopPrivatePing();
        this.notifyClose({ event: 'close', msg: `private connection closed: ${event.code}` } as WsResponse);
        this.handleReconnect('private');
      };
    });
  }

  /**
   * 登录
   */
  async login(): Promise<void> {
    if (!this.privateWs || this.privateWs.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not connected');
    }

    const timestamp = this.auth.getSecondsTimestamp();
    const { sign } = this.auth.sign(timestamp, 'GET', '/users/self/verify', '');

    this.send(this.privateWs, {
      op: 'login',
      args: [
        {
          apiKey: this.config.apiKey,
          passphrase: this.config.passphrase,
          timestamp,
          sign
        }
      ]
    });

    logger.debug('登录请求已发送');
  }

  /**
   * 订阅频道
   */
  subscribe(config: SubscribeConfig, callback: ChannelCallback): void {
    const { channel, instId } = config;

    // 判断是否为私有频道
    const privateChannels = ['account', 'positions', 'orders', 'algo-orders', 'balance_and_position'];
    const isPrivateChannel = privateChannels.includes(channel);
    const source = isPrivateChannel ? 'private' : 'public';

    const key = instId ? `${source}:${channel}:${instId}` : `${source}:${channel}`;
    this.subscriptions.set(key, {
      config,
      callback,
      timestamp: Date.now()
    } as Subscription);

    // 构建订阅消息 - args 必须是数组
    const args: WsChannelArgs = instId
      ? { channel, instId }
      : { channel };

    // 根据频道类型选择 WebSocket 连接
    const ws = isPrivateChannel ? this.privateWs : this.publicWs;

    this.send(ws, {
      op: 'subscribe',
      args: [args]
    });

    logger.info('订阅请求已发送', { channel, instId, source });
  }

  /**
   * 取消订阅
   */
  unsubscribe(channel: string, instId?: string): void {
    // 判断是否为私有频道
    const privateChannels = ['account', 'positions', 'orders', 'algo-orders', 'balance_and_position'];
    const isPrivateChannel = privateChannels.includes(channel);
    const source = isPrivateChannel ? 'private' : 'public';

    const key = instId ? `${source}:${channel}:${instId}` : `${source}:${channel}`;
    this.subscriptions.delete(key);

    const args: WsChannelArgs = instId
      ? { channel, instId }
      : { channel };

    // 根据频道类型选择 WebSocket 连接
    const ws = isPrivateChannel ? this.privateWs : this.publicWs;

    this.send(ws, {
      op: 'unsubscribe',
      args: [args]
    });

    logger.info('取消订阅请求已发送', { channel, instId, source });
  }

  /**
   * 取消所有订阅
   */
  unsubscribeAll(): void {
    for (const subscription of this.subscriptions.values()) {
      this.unsubscribe(subscription.config.channel, subscription.config.instId);
    }
    this.subscriptions.clear();
    logger.info('所有订阅已取消');
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.stopPublicPing();
    this.stopPrivatePing();

    if (this.publicReconnectTimer) {
      clearTimeout(this.publicReconnectTimer);
      this.publicReconnectTimer = null;
    }

    if (this.privateReconnectTimer) {
      clearTimeout(this.privateReconnectTimer);
      this.privateReconnectTimer = null;
    }

    if (this.publicWs) {
      this.publicWs.close();
      this.publicWs = null;
    }

    if (this.privateWs) {
      this.privateWs.close();
      this.privateWs = null;
    }

    this.state = 'disconnected';
    logger.info('已断开连接');
  }

  // =====================================================
  // 事件监听器
  // =====================================================

  onOpen(callback: EventCallback): void {
    this.onOpenCallbacks.push(callback);
  }

  onClose(callback: EventCallback): void {
    this.onCloseCallbacks.push(callback);
  }

  onError(callback: ErrorCallback): void {
    this.onErrorCallbacks.push(callback);
  }

  // =====================================================
  // 状态查询
  // =====================================================

  getState(): ConnectionState {
    return this.state;
  }

  isConnected(): boolean {
    return this.state === 'connected' || this.state === 'authenticated';
  }

  getSubscriptions(): Subscription[] {
    return Array.from(this.subscriptions.values());
  }

  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  removeAllListeners(): void {
    this.onOpenCallbacks = [];
    this.onCloseCallbacks = [];
    this.onErrorCallbacks = [];
  }
}

// =====================================================
// 工厂函数
// =====================================================

/**
 * 创建 WebSocket 客户端
 */
export function createWsClient(config: WsClientConfig): WsClient {
  return new WsClient(config);
}

/**
 * 从环境变量创建 WebSocket 客户端
 */
export function createWsClientFromEnv(): WsClient {
  return new WsClient();
}
