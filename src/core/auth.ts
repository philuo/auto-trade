/**
 * OKX API 认证模块
 *
 * 功能：
 * - API 签名生成（HMAC-SHA256）
 * - 请求头构建
 * - WebSocket 登录认证
 */

import { createHmac } from 'node:crypto';
import type { TdMode } from './constants.js';

// =====================================================
// 认证配置
// =====================================================

export interface AuthConfig {
  apiKey: string;
  secretKey: string;
  passphrase: string;
  isDemo?: boolean;
}

// =====================================================
// 签名结果
// =====================================================

export interface SignatureResult {
  timestamp: string;
  sign: string;
}

// =====================================================
// 请求头
// =====================================================

export interface RequestHeaders {
  'OK-ACCESS-KEY': string;
  'OK-ACCESS-SIGN': string;
  'OK-ACCESS-TIMESTAMP': string;
  'OK-ACCESS-PASSPHRASE': string;
  'Content-Type'?: string;
  [key: string]: string | undefined;
}

// =====================================================
// 认证类
// =====================================================

export class OkxAuth {
  private config: AuthConfig;
  private timeOffset: number = 0; // 服务器与本地时间的偏差（毫秒）

  constructor(config: AuthConfig) {
    this.config = config;
  }

  /**
   * 生成签名
   * @param timestamp ISO 格式时间戳
   * @param method HTTP 方法
   * @param requestPath 请求路径（包含查询参数）
   * @param body 请求体（JSON 字符串）
   * @returns 签名结果
   */
  sign(timestamp: string, method: string, requestPath: string, body: string): SignatureResult {
    // 签名串: timestamp + method + requestPath + body
    const message = timestamp + method + requestPath + body;

    // HMAC-SHA256 签名
    const hmac = createHmac('sha256', this.config.secretKey);
    hmac.update(message);
    const signature = hmac.digest('base64');

    return {
      timestamp,
      sign: signature
    };
  }

  /**
   * 生成当前时间戳（ISO 格式）
   */
  getTimestamp(): string {
    return new Date(Date.now() + this.timeOffset).toISOString();
  }

  /**
   * 生成 Unix 毫秒时间戳
   */
  getUnixTimestamp(): string {
    return (Date.now() + this.timeOffset).toString();
  }

  /**
   * 生成 Unix 秒级时间戳（用于 WebSocket 登录）
   */
  getSecondsTimestamp(): string {
    return Math.floor((Date.now() + this.timeOffset) / 1000).toString();
  }

  /**
   * 同步服务器时间
   * @param baseUrl REST API 基础 URL
   * @param proxy 代理地址
   */
  async syncTime(baseUrl: string = 'https://www.okx.com/api/v5', proxy?: string): Promise<void> {
    try {
      const response = await fetch(`${baseUrl}/public/time`, {
        proxy: proxy || process.env.HTTP_PROXY || process.env.HTTPS_PROXY
      });
      const data = await response.json() as Record<string, any>;

      if (data.code === '0' && data.data && data.data[0]) {
        const serverTimestamp = parseInt(data.data[0].ts);
        const localTimestamp = Date.now();
        this.timeOffset = serverTimestamp - localTimestamp;

        if (Math.abs(this.timeOffset) > 1000) {
          console.warn(`[Auth] 时间偏差检测: 本地时间与服务器时间相差 ${this.timeOffset}ms，已自动校准`);
        }
      }
    } catch (error) {
      console.warn('[Auth] 无法同步服务器时间，使用本地时间:', error);
    }
  }

  /**
   * 获取当前时间偏差
   */
  getTimeOffset(): number {
    return this.timeOffset;
  }

  /**
   * 构建请求头
   * @param method HTTP 方法
   * @param requestPath 请求路径（包含查询参数）
   * @param body 请求体（JSON 字符串）
   * @returns 请求头对象
   */
  buildHeaders(method: string, requestPath: string, body: string = ''): RequestHeaders {
    const timestamp = this.getTimestamp();
    const { sign } = this.sign(timestamp, method, requestPath, body);

    return {
      'OK-ACCESS-KEY': this.config.apiKey,
      'OK-ACCESS-SIGN': sign,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': this.config.passphrase,
      'Content-Type': 'application/json'
    };
  }

  /**
   * 构建 WebSocket 登录消息
   * @returns 登录消息对象
   */
  buildWsLoginMessage(): Record<string, unknown> {
    // WebSocket 登录使用秒级时间戳
    const timestamp = this.getSecondsTimestamp();
    const { sign } = this.sign(timestamp, 'GET', '/users/self/verify', '');

    return {
      op: 'login',
      args: [{
        apiKey: this.config.apiKey,
        passphrase: this.config.passphrase,
        timestamp,
        sign
      }]
    };
  }

  /**
   * 验证币种是否允许交易
   * @param coin 币种
   * @returns 是否允许
   */
  validateCoin(coin: string): boolean {
    const allowedCoins = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE'];
    return allowedCoins.includes(coin);
  }

  /**
   * 验证杠杆是否在限制内
   * @param coin 币种
   * @param leverage 杠杆倍数
   * @returns 是否允许
   */
  validateLeverage(coin: string, leverage: number): boolean {
    const swapAllowedCoins = ['BTC', 'ETH'];

    // 非白名单币种不允许合约
    if (!swapAllowedCoins.includes(coin)) {
      return false;
    }

    const limits: Record<string, number> = {
      'BTC': 5,
      'ETH': 3,
    };

    const maxLeverage = limits[coin];
    return maxLeverage !== undefined && leverage <= maxLeverage;
  }

  /**
   * 获取交易模式
   * @param instType 产品类型
   * @returns 交易模式
   */
  getTdMode(instType: string): TdMode {
    switch (instType) {
      case 'SPOT':
        return 'cash';
      case 'SWAP':
        return 'isolated';
      default:
        return 'cash';
    }
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<AuthConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取配置
   */
  getConfig(): AuthConfig {
    return { ...this.config };
  }

  /**
   * 获取 API Key（用于日志记录）
   */
  getApiKeyPrefix(): string {
    return this.config.apiKey.substring(0, 8) + '...';
  }
}

// =====================================================
// 工具函数
// =====================================================

/**
 * 创建认证实例
 */
export function createAuth(config: AuthConfig): OkxAuth {
  return new OkxAuth(config);
}

/**
 * 从环境变量加载配置
 */
export function loadAuthFromEnv(): AuthConfig | null {
  const apiKey = process.env.OKX_API_KEY;
  const secretKey = process.env.OKX_SECRET_KEY;
  const passphrase = process.env.OKX_PASSPHRASE;
  const isDemo = process.env.OKX_IS_DEMO === 'true';

  if (!apiKey || !secretKey || !passphrase) {
    console.warn('[Auth] Missing required environment variables: OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE');
    return null;
  }

  return {
    apiKey,
    secretKey,
    passphrase,
    isDemo: isDemo ?? true
  };
}

/**
 * 验证请求参数
 */
export function validateRequestParams(params: {
  instId?: string;
  instType?: string;
  tdMode?: string;
  side?: string;
  ordType?: string;
  sz?: string;
  px?: string;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // 验证产品 ID
  if (params.instId && !params.instId.includes('-')) {
    errors.push('Invalid instId format, expected format like BTC-USDT or BTC-USDT-SWAP');
  }

  // 验证产品类型
  if (params.instType && !['SPOT', 'SWAP', 'MARGIN', 'OPTIONS'].includes(params.instType)) {
    errors.push('Invalid instType, must be one of: SPOT, SWAP, MARGIN, OPTIONS');
  }

  // 验证交易模式
  if (params.tdMode && !['cash', 'isolated', 'cross'].includes(params.tdMode)) {
    errors.push('Invalid tdMode, must be one of: cash, isolated, cross');
  }

  // 验证订单方向
  if (params.side && !['buy', 'sell'].includes(params.side)) {
    errors.push('Invalid side, must be one of: buy, sell');
  }

  // 验证订单类型
  if (params.ordType && !['market', 'limit', 'post_only', 'fok', 'ioc'].includes(params.ordType)) {
    errors.push('Invalid ordType, must be one of: market, limit, post_only, fok, ioc');
  }

  // 限价单必须有价格
  if (params.ordType === 'limit' && !params.px) {
    errors.push('Limit order must have price (px)');
  }

  // 验证数量
  if (params.sz && parseFloat(params.sz) <= 0) {
    errors.push('Order size (sz) must be greater than 0');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
