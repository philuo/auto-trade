/**
 * OKX API 交互封装
 *
 * 负责与 OKX 交易所 API 进行交互，获取市场数据
 *
 * 文档参考：https://www.okx.com/docs-v5/
 */

import { logger } from '../utils/logger.js';
import type {
  OKXResponse,
  OKXTicker,
  OKXKLineData,
  KLineInterval,
} from './types.js';
import {
  MarketDataError,
  APIRequestError,
  DataParseError,
} from './types.js';

/**
 * OKX API 类
 */
export class OKXAPI {
  private readonly baseURL: string;
  private readonly apiKey?: string;
  private readonly secretKey?: string;
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
  async getSpotTickers(): Promise<Map<string, OKXTicker>> {
    const url = `${this.baseURL}/api/v5/market/tickers?instType=SPOT`;

    const response = await this.request<OKXTicker[]>(url);
    const tickers = new Map<string, OKXTicker>();

    for (const ticker of response.data) {
      // 只保存 USDT 交易对
      if (ticker.instId.endsWith('-USDT')) {
        const coin = ticker.instId.replace('-USDT', '');
        tickers.set(coin, ticker);
      }
    }

    logger.debug(`获取到 ${tickers.size} 个现货币种行情`);
    return tickers;
  }

  /**
   * 获取单个币种行情
   * GET /api/v5/market/ticker?instId=BTC-USDT
   */
  async getTicker(coin: string): Promise<OKXTicker> {
    const instId = `${coin}-USDT`;
    const url = `${this.baseURL}/api/v5/market/ticker?instId=${instId}`;

    const response = await this.request<OKXTicker[]>(url);

    if (response.data.length === 0) {
      throw new MarketDataError(`未找到币种 ${coin} 的行情数据`);
    }

    return response.data[0];
  }

  /**
   * 批量获取多个币种行情
   */
  async getBatchTickers(coins: string[]): Promise<Map<string, OKXTicker>> {
    const tickers = new Map<string, OKXTicker>();

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
  ): Promise<OKXKLineData[]> {
    const instId = `${coin}-USDT`;
    const url = `${this.baseURL}/api/v5/market/candles?instId=${instId}&bar=${bar}&limit=${limit}`;

    const response = await this.request<OKXKLineData[]>(url);
    return response.data;
  }

  /**
   * 批量获取K线数据
   */
  async getBatchCandles(
    coins: string[],
    bar: KLineInterval = '1H',
    limit: number = 100
  ): Promise<Map<string, OKXKLineData[]>> {
    const candles = new Map<string, OKXKLineData[]>();

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

  // =====================================================
  // HTTP 请求方法
  // =====================================================

  /**
   * 发起 HTTP 请求
   */
  private async request<T>(url: string): Promise<OKXResponse<T>> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
          signal: controller.signal,
        });

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
}

/**
 * 将 OKX Ticker 转换为 PriceData
 */
export function tickerToPriceData(ticker: OKXTicker, coin: string): {
  coin: string;
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  volumeCcy24h: number;
  timestamp: number;
} {
  const price = parseFloat(ticker.last);
  const open24h = parseFloat(ticker.open24h);

  return {
    coin,
    price,
    change24h: open24h > 0 ? ((price - open24h) / open24h) * 100 : 0,
    high24h: parseFloat(ticker.high24h),
    low24h: parseFloat(ticker.low24h),
    volume24h: parseFloat(ticker.vol24h),
    volumeCcy24h: parseFloat(ticker.volCcy24h),
    timestamp: parseInt(ticker.ts),
  };
}

/**
 * 将 OKX K线数据转换为 CandleData
 */
export function klineToCandleData(kline: OKXKLineData): {
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
