/**
 * 基础市场数据提供者
 *
 * 统一市场数据访问接口，消除重复代码
 */

import { logger } from '../utils/logger';
import type { Ticker, Kline, MarketContext } from '../types';

// =====================================================
// 数据获取接口
// =====================================================

/**
 * 数据获取接口
 * 定义所有市场数据提供者必须实现的方法
 */
export interface IMarketDataProvider {
  /**
   * 获取行情数据
   */
  getTicker(symbol: string): Promise<Ticker>;

  /**
   * 批量获取行情数据
   */
  getTickers(symbols: string[]): Promise<Map<string, Ticker>>;

  /**
   * 获取K线数据
   */
  getKlines(symbol: string, timeframe: string, limit?: number): Promise<Kline[]>;

  /**
   * 获取完整的市场上下文
   */
  getMarketContext(symbol: string): Promise<MarketContext>;
}

// =====================================================
// 抽象基类
// =====================================================

/**
 * 市场数据提供者抽象基类
 * 提供通用的数据获取逻辑，子类只需实现具体的API调用
 */
export abstract class BaseMarketDataProvider implements IMarketDataProvider {
  protected readonly isDemo: boolean;
  protected readonly proxy?: string;
  protected cache: Map<string, { data: any; expiry: number }>;
  protected readonly cacheTimeout: number;

  constructor(isDemo: boolean, proxy?: string, cacheTimeout: number = 5000) {
    this.isDemo = isDemo;
    this.proxy = proxy;
    this.cacheTimeout = cacheTimeout;
    this.cache = new Map();
  }

  // =====================================================
  // 公共方法
  // =====================================================

  /**
   * 获取行情数据（带缓存）
   */
  async getTicker(symbol: string): Promise<Ticker> {
    const cacheKey = `ticker_${symbol}`;
    const cached = this.getFromCache<Ticker>(cacheKey);
    if (cached) {
      return cached;
    }

    const ticker = await this.fetchTicker(symbol);
    this.setToCache(cacheKey, ticker);
    return ticker;
  }

  /**
   * 批量获取行情数据
   */
  async getTickers(symbols: string[]): Promise<Map<string, Ticker>> {
    const result = new Map<string, Ticker>();

    // 并行获取多个交易对的行情
    await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const ticker = await this.getTicker(symbol);
          result.set(symbol, ticker);
        } catch (error) {
          logger.error(`获取 ${symbol} 行情失败:`, error as Error | Record<string, unknown>);
        }
      })
    );

    return result;
  }

  /**
   * 获取K线数据（带缓存）
   */
  async getKlines(symbol: string, timeframe: string, limit: number = 100): Promise<Kline[]> {
    const cacheKey = `klines_${symbol}_${timeframe}_${limit}`;
    const cached = this.getFromCache<Kline[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const klines = await this.fetchKlines(symbol, timeframe, limit);
    this.setToCache(cacheKey, klines);
    return klines;
  }

  /**
   * 获取完整的市场上下文
   */
  async getMarketContext(symbol: string): Promise<MarketContext> {
    // 获取行情数据
    const ticker = await this.getTicker(symbol);

    // 获取多个时间周期的K线数据
    const timeframes = ['1m', '5m', '15m', '1H', '4H', '1D'];
    const klines = new Map<string, Kline[]>();

    await Promise.all(
      timeframes.map(async (timeframe) => {
        try {
          const data = await this.getKlines(symbol, timeframe);
          klines.set(timeframe, data);
        } catch (error) {
          logger.warn(`获取 ${symbol} ${timeframe} K线失败:`, { error: error instanceof Error ? error.message : String(error) });
        }
      })
    );

    return {
      symbol,
      currentPrice: ticker.last,
      ticker,
      klines,
      indicators: new Map(),
      marketState: {
        trend: 'sideways',
        volatility: 'normal',
        strength: 'none',
      },
    };
  }

  // =====================================================
  // 抽象方法（子类必须实现）
  // =====================================================

  /**
   * 获取单个行情数据（由子类实现）
   */
  protected abstract fetchTicker(symbol: string): Promise<Ticker>;

  /**
   * 获取K线数据（由子类实现）
   */
  protected abstract fetchKlines(symbol: string, timeframe: string, limit: number): Promise<Kline[]>;

  // =====================================================
  // 缓存管理
  // =====================================================

  /**
   * 从缓存获取数据
   */
  protected getFromCache<T>(key: string): T | null {
    const cached = this.cache.get(key);
    if (!cached) {
      return null;
    }

    if (Date.now() > cached.expiry) {
      this.cache.delete(key);
      return null;
    }

    return cached.data as T;
  }

  /**
   * 设置缓存
   */
  protected setToCache<T>(key: string, data: T): void {
    this.cache.set(key, {
      data,
      expiry: Date.now() + this.cacheTimeout,
    });
  }

  /**
   * 清除缓存
   */
  protected clearCache(pattern?: string): void {
    if (!pattern) {
      this.cache.clear();
      return;
    }

    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }
}

// =====================================================
// 现货市场数据提供者
// =====================================================

/**
 * 现货市场数据提供者
 */
export class SpotMarketDataProvider extends BaseMarketDataProvider {
  constructor(
    private readonly api: any, // OKX API 客户端
    isDemo: boolean,
    proxy?: string
  ) {
    super(isDemo, proxy);
  }

  protected async fetchTicker(symbol: string): Promise<Ticker> {
    const ticker = await this.api.getTicker(symbol);
    return {
      instId: ticker.instId,
      last: parseFloat(ticker.last),
      open24h: parseFloat(ticker.open24h),
      high24h: parseFloat(ticker.high24h),
      low24h: parseFloat(ticker.low24h),
      volume24h: parseFloat(ticker.vol24h),
      volumeCcy24h: parseFloat(ticker.volCcy24h),
      changePercent24h: parseFloat(ticker.changePercent24h),
    };
  }

  protected async fetchKlines(symbol: string, timeframe: string, limit: number): Promise<Kline[]> {
    const klines = await this.api.getKlines(symbol, timeframe, limit);
    return klines.map((k: any[]) => ({
      timestamp: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      volumeCcy: parseFloat(k[6]),
    }));
  }
}

// =====================================================
// 合约市场数据提供者
// =====================================================

/**
 * 合约市场数据提供者
 */
export class PerpetualMarketDataProvider extends BaseMarketDataProvider {
  constructor(
    private readonly api: any, // OKX API 客户端
    isDemo: boolean,
    proxy?: string
  ) {
    super(isDemo, proxy);
  }

  protected async fetchTicker(symbol: string): Promise<Ticker> {
    // 合约交易对格式转换: BTC-USDT-SWAP
    const swapSymbol = symbol.replace('-USDT', '-USDT-SWAP');
    const ticker = await this.api.getSwapTicker(swapSymbol);
    return {
      instId: ticker.instId,
      last: parseFloat(ticker.last),
      open24h: parseFloat(ticker.open24h),
      high24h: parseFloat(ticker.high24h),
      low24h: parseFloat(ticker.low24h),
      volume24h: parseFloat(ticker.vol24h),
      volumeCcy24h: parseFloat(ticker.volCcy24h),
      changePercent24h: parseFloat(ticker.changePercent24h),
    };
  }

  protected async fetchKlines(symbol: string, timeframe: string, limit: number): Promise<Kline[]> {
    const swapSymbol = symbol.replace('-USDT', '-USDT-SWAP');
    const klines = await this.api.getSwapKlines(swapSymbol, timeframe, limit);
    return klines.map((k: any[]) => ({
      timestamp: k[0],
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      volumeCcy: parseFloat(k[6]),
    }));
  }
}

// =====================================================
// 工厂函数
// =====================================================

/**
 * 创建市场数据提供者
 */
export function createMarketDataProvider(
  mode: 'SPOT' | 'PERPETUAL',
  api: any,
  isDemo: boolean,
  proxy?: string
): BaseMarketDataProvider {
  if (mode === 'SPOT') {
    return new SpotMarketDataProvider(api, isDemo, proxy);
  } else {
    return new PerpetualMarketDataProvider(api, isDemo, proxy);
  }
}
