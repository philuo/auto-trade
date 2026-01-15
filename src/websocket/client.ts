/**
 * OKX WebSocket 客户端
 *
 * 功能：
 * - 连接管理（连接、断开、重连）
 * - 登录认证
 * - 频道订阅与取消订阅
 * - 心跳保活
 * - 消息处理与分发
 */

import { OkxAuth, loadAuthFromEnv } from '../core/auth.js';
import { API_ENDPOINTS } from '../core/constants.js';
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
  WsRequestArgs,
  WsRequest,
} from './types.js';

// =====================================================
// WebSocket 客户端类
// =====================================================

export class WsClient {
  private config: WsClientConfig;
  private auth: OkxAuth;
  private ws: WebSocket | null = null;
  private state: ConnectionState = 'disconnected';
  private subscriptions: Map<string, Subscription> = new Map();

  // 独立的重连计数和计时器（public 和 private 分开管理）
  private publicReconnectAttempts = 0;
  private privateReconnectAttempts = 0;
  private publicReconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private privateReconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // 独立的心跳计时器（public 和 private 分开管理）
  private publicPingTimer: ReturnType<typeof setInterval> | null = null;
  private publicPongTimer: ReturnType<typeof setTimeout> | null = null;
  private privatePingTimer: ReturnType<typeof setInterval> | null = null;
  private privatePongTimer: ReturnType<typeof setTimeout> | null = null;

  private messageQueue: string[] = [];

  // 事件回调
  private onOpenCallbacks: EventCallback[] = [];
  private onCloseCallbacks: EventCallback[] = [];
  private onErrorCallbacks: ErrorCallback[] = [];

  // 公共和私有连接
  private publicWs: WebSocket | null = null;
  private privateWs: WebSocket | null = null;

  // 代理设置
  private proxy: string | undefined;
  private timeSynced = false;

  constructor(config?: WsClientConfig) {
    if (config) {
      this.config = config;
      this.proxy = config.proxy;
      this.auth = new OkxAuth({
        apiKey: config.apiKey,
        secretKey: config.secretKey,
        passphrase: config.passphrase,
        isDemo: config.isDemo ?? true
      });
    } else {
      const authConfig = loadAuthFromEnv();
      if (!authConfig) {
        throw new Error('Missing OKX API credentials. Please provide config or set environment variables.');
      }
      // 从环境变量读取代理设置
      this.proxy = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
      this.config = {
        apiKey: authConfig.apiKey,
        secretKey: authConfig.secretKey,
        passphrase: authConfig.passphrase,
        isDemo: true,
        autoReconnect: true,
        reconnectInterval: 5000,
        maxReconnectAttempts: Infinity,  // 无限重连
        pingInterval: 25000,
        proxy: this.proxy,
        useExponentialBackoff: true,     // 启用指数退避
        maxReconnectInterval: 60000,      // 最大 60 秒
        backoffMultiplier: 1.5            // 每次重连间隔增加 1.5 倍
      };
      this.auth = new OkxAuth(authConfig);
    }
  }

  /**
   * 同步服务器时间
   * 在需要认证的操作前调用
   */
  private async ensureTimeSync(): Promise<void> {
    if (!this.timeSynced) {
      const baseUrl = this.config.isDemo ? 'https://www.okx.com/api/v5' : 'https://www.okx.com/api/v5';
      await this.auth.syncTime(baseUrl, this.proxy);
      this.timeSynced = true;
    }
  }

  // =====================================================
  // 连接管理
  // =====================================================

  /**
   * 连接到公共频道
   */
  async connectPublic(): Promise<void> {
    if (this.publicWs?.readyState === WebSocket.OPEN) {
      return;
    }

    const url = this.config.isDemo
      ? API_ENDPOINTS.DEMO_WS_PUBLIC
      : API_ENDPOINTS.LIVE_WS_PUBLIC;

    this.state = 'connecting';
    // Bun WebSocket 支持 proxy 选项
    this.publicWs = new WebSocket(url, this.proxy ? { proxy: this.proxy } : undefined);

    return new Promise((resolve, reject) => {
      if (!this.publicWs) return reject(new Error('WebSocket not initialized'));

      this.publicWs.onopen = () => {
        this.state = 'connected';
        this.startPublicPing();
        this.processMessageQueue();
        this.notifyOpen({ event: 'open', msg: 'Public connection opened' });
        resolve();
      };

      this.publicWs.onmessage = (event) => {
        this.handleMessage(event.data, 'public');
      };

      this.publicWs.onerror = (error) => {
        this.notifyError(new Error(`WebSocket error: ${error}`));
        reject(error);
      };

      this.publicWs.onclose = () => {
        this.state = 'disconnected';
        this.stopPublicPing();
        this.notifyClose({ event: 'close', msg: 'Public connection closed' });
        this.handleReconnect('public');
      };
    });
  }

  /**
   * 连接到私有频道
   */
  async connectPrivate(): Promise<void> {
    // 私有频道需要认证，先同步时间
    await this.ensureTimeSync();

    if (this.privateWs?.readyState === WebSocket.OPEN) {
      return;
    }

    const url = this.config.isDemo
      ? API_ENDPOINTS.DEMO_WS_PRIVATE
      : API_ENDPOINTS.LIVE_WS_PRIVATE;

    this.state = 'connecting';
    // Bun WebSocket 支持 proxy 选项
    this.privateWs = new WebSocket(url, this.proxy ? { proxy: this.proxy } : undefined);

    return new Promise((resolve, reject) => {
      if (!this.privateWs) return reject(new Error('WebSocket not initialized'));

      this.privateWs.onopen = () => {
        this.state = 'connected';
        resolve();
      };

      this.privateWs.onmessage = (event) => {
        this.handleMessage(event.data, 'private');
      };

      this.privateWs.onerror = (error) => {
        this.notifyError(new Error(`WebSocket error: ${error}`));
        reject(error);
      };

      this.privateWs.onclose = () => {
        this.state = 'disconnected';
        this.stopPrivatePing();
        this.notifyClose({ event: 'close', msg: 'Private connection closed' });
        this.handleReconnect('private');
      };
    });
  }

  /**
   * 连接并登录私有频道
   */
  async connect(): Promise<void> {
    await this.ensureTimeSync();
    await this.connectPrivate();
    await this.login();
  }

  /**
   * 登录认证
   */
  async login(): Promise<void> {
    if (this.state !== 'connected') {
      throw new Error('Not connected. Call connectPrivate() first.');
    }

    this.state = 'authenticating';

    return new Promise((resolve, reject) => {
      // Set up one-time login response handler first
      const onMessage = (event: MessageEvent) => {
        try {
          const response = JSON.parse(event.data) as WsResponse;

          if (response.event === 'login' && response.code === '0') {
            this.state = 'authenticated';
            this.startPrivatePing();
            this.processMessageQueue();
            // Remove the one-time handler after successful login
            if (this.privateWs) {
              this.privateWs.onmessage = (e) => this.handleMessage(e.data, 'private');
            }
            resolve();
          } else if (response.event === 'error') {
            reject(new Error(`Login failed: ${response.msg}`));
          }
        } catch (error) {
          reject(error);
        }
      };

      if (this.privateWs) {
        // Set the message handler before generating timestamp
        this.privateWs.onmessage = onMessage;

        // Generate timestamp and sign right before sending to minimize expiry risk
        // WebSocket 登录使用秒级时间戳（不是毫秒）
        const timestamp = this.auth.getSecondsTimestamp();
        const sign = this.auth.sign(timestamp, 'GET', '/users/self/verify', '');

        const loginMessage: WsRequest = {
          op: 'login',
          args: [{
            apiKey: this.config.apiKey,
            passphrase: this.config.passphrase,
            timestamp: timestamp,
            sign: sign.sign,
          }],
        };

        // Send immediately after timestamp generation
        this.privateWs.send(JSON.stringify(loginMessage));
      } else {
        reject(new Error('Private WebSocket not initialized'));
      }
    });
  }

  /**
   * 断开连接
   */
  disconnect(): void {
    this.stopPublicPing();
    this.stopPrivatePing();

    // 清除所有重连计时器
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
    this.subscriptions.clear();
    this.publicReconnectAttempts = 0;
    this.privateReconnectAttempts = 0;
    this.timeSynced = false; // 重置时间同步标志，以便下次连接时重新同步
  }

  // =====================================================
  // 频道订阅
  // =====================================================

  /**
   * 订阅频道
   */
  subscribe<T = unknown>(config: SubscribeConfig, callback: ChannelCallback<T>): void {
    const key = this.getSubscriptionKey(config);
    this.subscriptions.set(key, { config, callback: callback as ChannelCallback });

    const subscribeMessage: WsRequest = {
      op: 'subscribe',
      args: [this.configToArgs(config)],
    };

    this.sendMessage(subscribeMessage);
  }

  /**
   * 取消订阅
   */
  unsubscribe(config: SubscribeConfig): void {
    const key = this.getSubscriptionKey(config);
    this.subscriptions.delete(key);

    const unsubscribeMessage: WsRequest = {
      op: 'unsubscribe',
      args: [this.configToArgs(config)],
    };

    this.sendMessage(unsubscribeMessage);
  }

  /**
   * 取消所有订阅
   */
  unsubscribeAll(): void {
    for (const [key, subscription] of this.subscriptions) {
      const unsubscribeMessage: WsRequest = {
        op: 'unsubscribe',
        args: [this.configToArgs(subscription.config)],
      };
      this.sendMessage(unsubscribeMessage);
    }
    this.subscriptions.clear();
  }

  // =====================================================
  // 消息处理
  // =====================================================

  /**
   * 发送消息
   */
  private sendMessage(message: WsRequest): void {
    const messageStr = JSON.stringify(message);

    // Queue message if not connected
    if (this.state !== 'authenticated' && this.state !== 'connected') {
      this.messageQueue.push(messageStr);
      return;
    }

    // Send to appropriate connection
    const firstArg = message.args?.[0];
    if (firstArg && this.isChannelArgs(firstArg) && this.isPrivateChannel(firstArg.channel)) {
      if (this.privateWs?.readyState === WebSocket.OPEN) {
        this.privateWs.send(messageStr);
      } else {
        this.messageQueue.push(messageStr);
      }
    } else {
      if (this.publicWs?.readyState === WebSocket.OPEN) {
        this.publicWs.send(messageStr);
      } else {
        this.messageQueue.push(messageStr);
      }
    }
  }

  /**
   * 处理接收到的消息
   */
  private handleMessage(data: string, source: 'public' | 'private'): void {
    try {
      const response = JSON.parse(data) as WsResponse;

      // Handle event messages
      if (response.event) {
        if (response.event === 'error') {
          this.notifyError(new Error(`WebSocket error: ${response.msg}`));
        } else if (response.event === 'pong') {
          // Clear pong timeout when we receive pong response
          // 根据来源清除对应的 pong 超时计时器
          if (source === 'public' && this.publicPongTimer) {
            clearTimeout(this.publicPongTimer);
            this.publicPongTimer = null;
          } else if (source === 'private' && this.privatePongTimer) {
            clearTimeout(this.privatePongTimer);
            this.privatePongTimer = null;
          }
        }
        return;
      }

      // Handle data messages
      if (response.data && response.arg) {
        const dataMessage = response as WsDataMessage;
        const key = this.getSubscriptionKeyFromArgs(response.arg);

        const subscription = this.subscriptions.get(key);
        if (subscription) {
          subscription.callback(dataMessage.data);
        }
      }
    } catch (error) {
      this.notifyError(error as Error);
    }
  }

  /**
   * 处理消息队列
   */
  private processMessageQueue(): void {
    // 使用 for 循环处理队列，以便可以将无法发送的消息重新排队
    const initialLength = this.messageQueue.length;
    for (let i = 0; i < initialLength; i++) {
      const message = this.messageQueue.shift();
      if (!message) continue;

      const parsed = JSON.parse(message) as WsRequest;
      const firstArg = parsed.args?.[0];

      let sent = false;
      if (firstArg && this.isChannelArgs(firstArg) && this.isPrivateChannel(firstArg.channel)) {
        if (this.privateWs?.readyState === WebSocket.OPEN) {
          this.privateWs.send(message);
          sent = true;
        }
      } else {
        if (this.publicWs?.readyState === WebSocket.OPEN) {
          this.publicWs.send(message);
          sent = true;
        }
      }

      // 如果消息无法发送，重新排队到末尾
      if (!sent) {
        this.messageQueue.push(message);
      }
    }
  }

  // =====================================================
  // 心跳与重连
  // =====================================================

  /**
   * 开始公共连接心跳
   */
  private startPublicPing(): void {
    this.stopPublicPing();

    this.publicPingTimer = setInterval(() => {
      if (this.publicWs?.readyState === WebSocket.OPEN) {
        const pingMessage: WsRequest = { op: 'ping' };
        this.publicWs.send(JSON.stringify(pingMessage));

        // Set pong timeout
        this.publicPongTimer = setTimeout(() => {
          this.notifyError(new Error('Public WebSocket pong timeout'));
          // 仅关闭和重连 public 连接
          if (this.publicWs) {
            this.publicWs.close();
          }
        }, 10000);
      }
    }, this.config.pingInterval ?? 25000);
  }

  /**
   * 停止公共连接心跳
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
   * 开始私有连接心跳
   */
  private startPrivatePing(): void {
    this.stopPrivatePing();

    this.privatePingTimer = setInterval(() => {
      if (this.privateWs?.readyState === WebSocket.OPEN) {
        const pingMessage: WsRequest = { op: 'ping' };
        this.privateWs.send(JSON.stringify(pingMessage));

        // Set pong timeout
        this.privatePongTimer = setTimeout(() => {
          this.notifyError(new Error('Private WebSocket pong timeout'));
          // 仅关闭和重连 private 连接
          if (this.privateWs) {
            this.privateWs.close();
          }
        }, 10000);
      }
    }, this.config.pingInterval ?? 25000);
  }

  /**
   * 停止私有连接心跳
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
   * 处理重连
   */
  private handleReconnect(source: 'public' | 'private'): void {
    if (!this.config.autoReconnect) {
      return;
    }

    const maxAttempts = this.config.maxReconnectAttempts ?? Infinity;

    // 根据来源检查对应的重连计数器
    const currentAttempts = source === 'public' ? this.publicReconnectAttempts : this.privateReconnectAttempts;
    if (currentAttempts >= maxAttempts) {
      this.notifyError(new Error(`${source} connection: Max reconnection attempts reached`));
      return;
    }

    // 增加对应的重连计数
    if (source === 'public') {
      this.publicReconnectAttempts++;
    } else {
      this.privateReconnectAttempts++;
    }

    // 计算重连间隔（支持指数退避）
    const reconnectDelay = this.calculateReconnectDelay(currentAttempts);

    console.log(`[WsClient] ${source} connection reconnecting in ${reconnectDelay}ms (attempt ${currentAttempts}/${maxAttempts === Infinity ? '∞' : maxAttempts})`);

    // 设置重连计时器
    const reconnectTimer = setTimeout(async () => {
      try {
        if (source === 'private') {
          await this.connectPrivate();
          await this.login();
          // Resubscribe to all private channels
          for (const subscription of this.subscriptions.values()) {
            if (this.isPrivateChannel(subscription.config.channel)) {
              const subscribeMessage: WsRequest = {
                op: 'subscribe',
                args: [this.configToArgs(subscription.config)],
              };
              this.sendMessage(subscribeMessage);
            }
          }
        } else {
          await this.connectPublic();
          // Resubscribe to all public channels
          for (const subscription of this.subscriptions.values()) {
            if (!this.isPrivateChannel(subscription.config.channel)) {
              const subscribeMessage: WsRequest = {
                op: 'subscribe',
                args: [this.configToArgs(subscription.config)],
              };
              this.sendMessage(subscribeMessage);
            }
          }
        }

        // 重连成功，重置对应的计数器
        if (source === 'public') {
          this.publicReconnectAttempts = 0;
          this.publicReconnectTimer = null;
        } else {
          this.privateReconnectAttempts = 0;
          this.privateReconnectTimer = null;
        }

        console.log(`[WsClient] ${source} connection reconnected successfully`);
      } catch (error) {
        this.notifyError(error as Error);
        // 继续尝试重连
        this.handleReconnect(source);
      }
    }, reconnectDelay);

    // 保存计时器引用
    if (source === 'public') {
      this.publicReconnectTimer = reconnectTimer;
    } else {
      this.privateReconnectTimer = reconnectTimer;
    }
  }

  /**
   * 计算重连延迟（支持指数退避）
   */
  private calculateReconnectDelay(attempt: number): number {
    const baseInterval = this.config.reconnectInterval ?? 5000;
    const useExponentialBackoff = this.config.useExponentialBackoff ?? true;
    const maxInterval = this.config.maxReconnectInterval ?? 60000;
    const multiplier = this.config.backoffMultiplier ?? 1.5;

    if (!useExponentialBackoff) {
      return baseInterval;
    }

    // 指数退避: baseInterval * (multiplier ^ (attempt - 1))
    const exponentialDelay = baseInterval * Math.pow(multiplier, attempt - 1);

    // 限制最大值
    return Math.min(exponentialDelay, maxInterval);
  }

  // =====================================================
  // 事件监听
  // =====================================================

  /**
   * 监听连接打开事件
   */
  onOpen(callback: EventCallback): void {
    this.onOpenCallbacks.push(callback);
  }

  /**
   * 监听连接关闭事件
   */
  onClose(callback: EventCallback): void {
    this.onCloseCallbacks.push(callback);
  }

  /**
   * 监听错误事件
   */
  onError(callback: ErrorCallback): void {
    this.onErrorCallbacks.push(callback);
  }

  /**
   * 移除所有监听器
   */
  removeAllListeners(): void {
    this.onOpenCallbacks = [];
    this.onCloseCallbacks = [];
    this.onErrorCallbacks = [];
  }

  // =====================================================
  // 辅助方法
  // =====================================================

  /**
   * 判断是否为私有频道
   */
  private isPrivateChannel(channel?: string): boolean {
    const privateChannels = ['account', 'positions', 'orders', 'orders-algo'];
    return channel ? privateChannels.includes(channel) : false;
  }

  /**
   * 判断 args 是否为频道参数（非登录参数）
   */
  private isChannelArgs(args?: WsRequestArgs): args is WsChannelArgs {
    return args !== undefined && 'channel' in args;
  }

  /**
   * 获取订阅键
   */
  private getSubscriptionKey(config: SubscribeConfig): string {
    return `${config.channel}:${config.instType ?? ''}:${config.instId ?? ''}:${config.ccy ?? ''}`;
  }

  /**
   * 从频道参数获取订阅键
   */
  private getSubscriptionKeyFromArgs(args: WsChannelArgs): string {
    return `${args.channel}:${args.instType ?? ''}:${args.instId ?? ''}:${args.ccy ?? ''}`;
  }

  /**
   * 转换配置为频道参数
   */
  private configToArgs(config: SubscribeConfig): WsChannelArgs {
    const args: WsChannelArgs = { channel: config.channel };
    if (config.instType) args.instType = config.instType;
    if (config.instId) args.instId = config.instId;
    if (config.ccy) args.ccy = config.ccy;
    if (config.instFamily) args.instFamily = config.instFamily;
    if (config.bar) args.bar = config.bar;
    return args;
  }

  /**
   * 通知连接打开
   */
  private notifyOpen(event: WsResponse): void {
    this.onOpenCallbacks.forEach(callback => callback(event));
  }

  /**
   * 通知连接关闭
   */
  private notifyClose(event: WsResponse): void {
    this.onCloseCallbacks.forEach(callback => callback(event));
  }

  /**
   * 通知错误
   */
  private notifyError(error: Error): void {
    this.onErrorCallbacks.forEach(callback => callback(error));
  }

  /**
   * 获取连接状态
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * 获取订阅数量
   */
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }
}

// =====================================================
// 工厂函数
// =====================================================

/**
 * 创建 WebSocket 客户端实例
 */
export function createWsClient(config?: WsClientConfig): WsClient {
  return new WsClient(config);
}

/**
 * 从环境变量创建 WebSocket 客户端实例
 */
export function createWsClientFromEnv(): WsClient {
  return new WsClient();
}
