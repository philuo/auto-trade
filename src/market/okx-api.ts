/**
 * OKX API 交互封装
 *
 * 负责与 OKX 交易所 API 进行交互，获取市场数据
 *
 * 文档参考：https://www.okx.com/docs-v5/
 */

import { logger } from '../utils';

// 加载.env文件中的代理配置
const httpProxy = process.env.HTTP_PROXY || process.env.http_proxy;
const httpsProxy = process.env.HTTPS_PROXY || process.env.https_proxy;

// 设置OKX请求的代理
if (httpsProxy || httpProxy) {
  process.env.HTTPS_PROXY = httpsProxy || httpProxy!;
  process.env.HTTP_PROXY = httpProxy || httpsProxy!;
  logger.info('OKX API 代理已启用', {
    httpProxy: process.env.HTTP_PROXY,
    httpsProxy: process.env.HTTPS_PROXY,
  });
}

import type {
  OKXResponse,
  OKXKLineData,
  KLineInterval,
  Ticker,
  CandleRaw,
  CandleNumber,
  OrderBook,
  OrderBookParams,
  OrderBookWithNum,
  Trade,
  TradesParams,
} from './types';
import {
  MarketDataError,
  APIRequestError,
  DataParseError,
} from './types;

// =====================================================
// OKX API 类
// =====================================================

export class OKXAPI {
  private readonly baseURL: string;
  private readonly apiKey?: string;
  // 保留用于未来私有 API 调用（需要签名）
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private readonly secretKey?: string;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private readonly passphrase?: string;
  private readonly timeout: number;
  private readonly maxRetries: number;
  private readonly retryDelay: number;

  constructor(config: {
    baseURL?: string;
    apiKey?: string;
    secretKey?: string;
    passphrase?: string;
    timeout?: number;
    maxRetries?: number;
    retryDelay?: number;
  } = {}) {
    this.baseURL = config.baseURL || 'https://www.okx.com';
    this.apiKey = config.apiKey;
    this.secretKey = config.secretKey;
    this.passphrase = config.passphrase;
    this.timeout = config.timeout || 10000;
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;

    logger.info('OKX API 初始化', {
      baseURL: this.baseURL,
      hasCredentials: !!this.apiKey,
    });
  }

  // =====================================================
  // 公共 API（不需要认证）
  // =====================================================

  /**
   * 获取所有现货币种行情
   * GET /api/v5/market/tickers?instType=SPOT
   */
  async getSpotTickers(): Promise<Map<string, Ticker>> {
    const url = `${this.baseURL}/api/v5/market/tickers?instType=SPOT`;

    const response = await this.request<any[]>(url);
    const tickers = new Map<string, Ticker>();

    for (const ticker of response.data) {
      // 只保存 USDT 交易对
      if (ticker.instId.endsWith('-USDT')) {
        const coin = ticker.instId.replace('-USDT', '');
        tickers.set(coin, this.convertToTicker(ticker));
      }
    }

    logger.debug(`获取到 ${tickers.size} 个现货币种行情`);
    return tickers;
  }

  /**
   * 获取单个币种行情
   * GET /api/v5/market/ticker?instId=BTC-USDT
   * @param coin 币种名称 (如 'BTC') 或完整交易对 ID (如 'BTC-USDT')
   */
  async getTicker(coin: string): Promise<Ticker> {
    // 检测是否已经包含 -USDT 后缀
    const instId = coin.includes('-') ? coin : `${coin}-USDT`;
    const url = `${this.baseURL}/api/v5/market/ticker?instId=${instId}`;

    const response = await this.request<any[]>(url);

    if (response.data.length === 0) {
      throw new MarketDataError(`未找到币种 ${coin} 的行情数据`);
    }

    return this.convertToTicker(response.data[0]);
  }

  /**
   * 获取所有产品行情（兼容旧 API）
   * @param instType 产品类型 SPOT/SWAP/FUTURES/OPTION
   * @param instId 产品ID
   */
  async getTickers(instType?: string, instId?: string): Promise<Ticker[]> {
    const params: Record<string, string> = {};
    if (instType) params.instType = instType;
    if (instId) params.instId = instId;

    const queryString = new URLSearchParams(params).toString();
    const url = `${this.baseURL}/api/v5/market/tickers${queryString ? `?${queryString}` : ''}`;

    const response = await this.request<any[]>(url);
    return response.data.map((t: any) => this.convertToTicker(t));
  }

  /**
   * 批量获取多个币种行情
   */
  async getBatchTickers(coins: string[]): Promise<Map<string, Ticker>> {
    const tickers = new Map<string, Ticker>();

    // 并发请求，但限制并发数
    const batchSize = 10;
    for (let i = 0; i < coins.length; i += batchSize) {
      const batch = coins.slice(i, i + batchSize);
      const batchPromises = batch.map(coin =>
        this.getTicker(coin).catch(error => {
          logger.warn(`获取 ${coin} 行情失败`, { error: error.message });
          return null;
        })
      );

      const results = await Promise.all(batchPromises);
      for (let j = 0; j < results.length; j++) {
        if (results[j]) {
          tickers.set(batch[j], results[j]!);
        }
      }
    }

    logger.debug(`批量获取 ${tickers.size}/${coins.length} 个币种行情`);
    return tickers;
  }

  /**
   * 获取K线数据
   * GET /api/v5/market/candles?instId=BTC-USDT&bar=1H&limit=100
   */
  async getCandles(
    coin: string,
    bar: KLineInterval = '1H',
    limit: number = 100
  ): Promise<CandleRaw[]> {
    const instId = `${coin}-USDT`;
    const url = `${this.baseURL}/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=${limit}`;

    const response = await this.request<CandleRaw[]>(url);
    return response.data;
  }

  /**
   * 批量获取K线数据
   */
  async getBatchCandles(
    coins: string[],
    bar: KLineInterval = '1H',
    limit: number = 100
  ): Promise<Map<string, CandleRaw[]>> {
    const candles = new Map<string, CandleRaw[]>();

    // 并发请求，但限制并发数
    const batchSize = 5;
    for (let i = 0; i < coins.length; i += batchSize) {
      const batch = coins.slice(i, i + batchSize);
      const batchPromises = batch.map(coin =>
        this.getCandles(coin, bar, limit).catch(error => {
          logger.warn(`获取 ${coin} K线失败`, { error: error.message });
          return [];
        })
      );

      const results = await Promise.all(batchPromises);
      for (let j = 0; j < results.length; j++) {
        if (results[j].length > 0) {
          candles.set(batch[j], results[j]!);
        }
      }
    }

    logger.debug(`批量获取 ${candles.size}/${coins.length} 个币种K线`);
    return candles;
  }

  /**
   * 获取产品深度数据
   */
  async getOrderBook(params: OrderBookParams): Promise<OrderBook> {
    const requestParams: Record<string, string | number | boolean> = {
      instId: params.instId
    };
    if (params.sz) requestParams.sz = params.sz;
    const url = `${this.baseURL}/api/v5/market/books?${new URLSearchParams(requestParams as any).toString()}`;

    const result = await this.request<OrderBook[]>(url);
    return result.data[0];
  }

  /**
   * 获取深度快照书籍数据
   */
  async getOrderBookSnapshot(instId: string, sz = 1): Promise<OrderBookWithNum> {
    const url = `${this.baseURL}/api/v5/market/books?instId=${instId}&sz=${sz}`;
    const result = await this.request<OrderBookWithNum[]>(url);
    return result.data[0];
  }

  /**
   * 获取深度数据（含订单数）
   */
  async getOrderBookWithOrders(instId: string, sz = 25): Promise<OrderBookWithNum> {
    const url = `${this.baseURL}/api/v5/market/books?instId=${instId}&sz=${sz}`;
    const result = await this.request<OrderBookWithNum[]>(url);
    return result.data[0];
  }

  /**
   * 获取所有交易产品的公共频道成交数据
   */
  async getTrades(params: TradesParams): Promise<Trade[]> {
    const requestParams: Record<string, string | number | boolean> = {
      instId: params.instId
    };
    if (params.limit) requestParams.limit = params.limit;
    const url = `${this.baseURL}/api/v5/market/trades?${new URLSearchParams(requestParams as any).toString()}`;

    const response = await this.request<Trade[]>(url);
    return response.data;
  }

  /**
   * 获取最新成交记录
   */
  async getLatestTrades(instId: string, limit = 100): Promise<Trade[]> {
    return this.getTrades({ instId, limit: limit.toString() });
  }

  /**
   * 获取24小时总成交量
   */
  async getVolume(): Promise<{ volCcy: number; volUsd: number }> {
    const tickers = await this.getTickers();
    // Volume API 返回的是 tickers，我们需要计算总成交量
    const totalVolCcy = tickers.reduce((sum, t) => sum + parseFloat(t.volCcy24h || '0'), 0);
    const totalVolUsd = tickers.reduce((sum, t) => sum + parseFloat(t.volCcy24h || '0') * parseFloat(t.last), 0);

    return {
      volCcy: totalVolCcy,
      volUsd: totalVolUsd
    };
  }

  // =====================================================
  // HTTP 请求方法
  // =====================================================

  /**
   * 发起 HTTP 请求（支持代理）
   */
  private async request<T>(url: string): Promise<OKXResponse<T>> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        // Bun fetch 配置
        const fetchOptions: RequestInit = {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
          signal: controller.signal,
        };

        // 添加代理配置（如果设置了代理）
        if (httpProxy || httpsProxy) {
          // Bun 的 fetch 支持通过环境变量自动使用代理
          // 也可以通过 proxy 选项配置
        }

        const response = await fetch(url, fetchOptions);

        clearTimeout(timeoutId);

        // 检查 HTTP 状态码
        if (!response.ok) {
          throw new APIRequestError(
            `HTTP ${response.status}: ${response.statusText}`,
            response.status
          );
        }

        const text = await response.text();

        // 解析 JSON
        let data: OKXResponse<T>;
        try {
          data = JSON.parse(text);
        } catch (parseError) {
          throw new DataParseError(
            `JSON 解析失败: ${parseError}`,
            text
          );
        }

        // 检查 OKX 响应码
        if (data.code !== '0') {
          throw new MarketDataError(
            `OKX API 错误: ${data.msg}`,
            data.code,
            data
          );
        }

        // 成功，返回数据
        return data;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // 如果是中止错误（超时），记录日志
        if (lastError.name === 'AbortError') {
          logger.warn(`请求超时: ${url}`);
        }

        // 如果不是最后一次尝试，等待后重试
        if (attempt < this.maxRetries - 1) {
          const delay = this.retryDelay * Math.pow(2, attempt); // 指数退避
          logger.debug(`请求失败，${delay}ms 后重试 (${attempt + 1}/${this.maxRetries})`);
          await this.sleep(delay);
        }
      }
    }

    // 所有重试都失败
    throw new MarketDataError(
      `请求失败，已重试 ${this.maxRetries} 次`,
      'MAX_RETRIES_EXCEEDED',
      { error: lastError?.message }
    );
  }

  /**
   * 休眠指定毫秒
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // =====================================================
  // 私有方法：类型转换
  // =====================================================

  /**
   * 将 OKX API 响应转换为 Ticker 类型
   */
  private convertToTicker(data: any): Ticker {
    return {
      instType: data.instType,
      instId: data.instId,
      last: data.last,
      lastSz: data.lastSz,
      askPx: data.askPx,
      bidPx: data.bidPx,
      askSz: data.askSz,
      bidSz: data.bidSz,
      open24h: data.open24h,
      high24h: data.high24h,
      low24h: data.low24h,
      volCcy24h: data.volCcy24h,
      vol24h: data.vol24h,
      sodUtc0: data.sodUtc0,
      sodUtc8: data.sodUtc8,
      ts: data.ts,
      // 计算常用字段
      price: parseFloat(data.last),
      change24h: data.open24h ? ((parseFloat(data.last) - parseFloat(data.open24h)) / parseFloat(data.open24h)) * 100 : 0,
    };
  }
}

// =====================================================
// 工具函数
// =====================================================

/**
 * 将 OKX Ticker 转换为 PriceData
 */
export function tickerToPriceData(
  ticker: Ticker,
  coin?: string
): {
  coin: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  volumeCcy24h: number;
  timestamp: number;
} {
  const derivedCoin = coin ?? ticker.instId.replace('-USDT', '');
  const price = ticker.price || parseFloat(ticker.last);
  // 如果没有提供 change24h，则计算它
  let change24h = ticker.change24h ?? 0;
  if (change24h === 0 && ticker.open24h) {
    const open24h = parseFloat(ticker.open24h);
    if (open24h > 0) {
      change24h = ((price - open24h) / open24h) * 100;
    }
  }

  return {
    coin: derivedCoin,
    price,
    change24h,
    high24h: parseFloat(ticker.high24h),
    low24h: parseFloat(ticker.low24h),
    volume24h: parseFloat(ticker.vol24h || '0'),
    volumeCcy24h: parseFloat(ticker.volCcy24h || '0'),
    timestamp: parseInt(ticker.ts),
  };
}

/**
 * 将 OKX K线数据转换为 CandleData
 */
export function klineToCandleData(kline: CandleRaw | OKXKLineData): {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  volumeCcy: number;
} {
  return {
    timestamp: parseInt(kline[0]),
    open: parseFloat(kline[1]),
    high: parseFloat(kline[2]),
    low: parseFloat(kline[3]),
    close: parseFloat(kline[4]),
    volume: parseFloat(kline[5]),
    volumeCcy: parseFloat(kline[6]),
  };
}

/**
 * 格式化 K 线数据（旧 API 兼容）
 */
export function formatCandle(candle: any): {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  volCcy: number;
  volCcyQuote: number;
  confirmed: boolean;
} {
  return {
    timestamp: parseInt(candle.timestamp),
    open: parseFloat(candle.open),
    high: parseFloat(candle.high),
    low: parseFloat(candle.low),
    close: parseFloat(candle.close),
    volume: parseFloat(candle.volume),
    volCcy: parseFloat(candle.volCcy || '0'),
    volCcyQuote: parseFloat(candle.volCcyQuote || candle.volCcyQuote || '0'),
    confirmed: candle.confirm === '1' || candle.confirm === true,
  };
}

/**
 * 解析 K 线数据（旧 API 兼容）
 */
export function parseCandle(raw: CandleRaw): any {
  return {
    timestamp: raw[0],
    open: raw[1],
    high: raw[2],
    low: raw[3],
    close: raw[4],
    volume: raw[5],
    volCcy: raw[6],
    volCcyQuote: raw[7],
    confirm: raw[8],
  };
}

/**
 * 将 Candle 对象转换为数字格式
 */
export function candleToNumberFormat(candle: any): CandleNumber {
  return {
    timestamp: parseInt(candle.timestamp, 10),
    open: parseFloat(candle.open),
    high: parseFloat(candle.high),
    low: parseFloat(candle.low),
    close: parseFloat(candle.close),
    volume: parseFloat(candle.volume),
    volCcy: parseFloat(candle.volCcy),
    volCcyQuote: parseFloat(candle.volCcyQuote || candle.volCcyQuote || '0'),
    confirm: candle.confirm === '1' || candle.confirm === true,
  };
}

/**
 * 安全解析数字
 */
export function safeParseNumber(value: string | number | undefined | null): number {
  if (value === undefined || value === null || value === '') {
    return 0;
  }
  return typeof value === 'string' ? parseFloat(value) : value;
}
