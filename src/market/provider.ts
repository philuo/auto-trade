/**
 * 市场数据提供者
 *
 * 整合 OKX API、缓存和指标计算，提供统一的市场数据访问接口
 *
 * 职责：
 * 1. 从 OKX API 获取实时价格和K线数据
 * 2. 管理数据缓存
 * 3. 计算技术指标
 * 4. 提供完整的市场上下文
 */

import { logger } from '../utils/logger.js';
import { OKXAPI, tickerToPriceData, klineToCandleData } from './okx-api.js';
import { CacheManager } from './cache.js';
import { IndicatorCalculator } from './indicators.js';
import type {
  PriceData,
  CandleData,
  TechnicalIndicators,
  MarketContext,
  MarketContextOptions,
  MarketDataConfig,
  KLineInterval,
} from './types.js';

/**
 * 市场数据提供者类
 */
export class MarketDataProvider {
  private okxApi: OKXAPI;
  private cacheManager: CacheManager;
  private indicatorCalculator: IndicatorCalculator;
  private config: MarketDataConfig;

  // 更新间隔映射（毫秒）
  private readonly updateIntervalMap: Record<KLineInterval, number> = {
    '1m': 10 * 1000,     // 1分钟K线，10秒更新
    '3m': 30 * 1000,     // 3分钟K线，30秒更新
    '5m': 60 * 1000,     // 5分钟K线，1分钟更新
    '15m': 3 * 60 * 1000,  // 15分钟K线，3分钟更新
    '30m': 5 * 60 * 1000,  // 30分钟K线，5分钟更新
    '1H': 10 * 60 * 1000,  // 1小时K线，10分钟更新
    '2H': 20 * 60 * 1000,
    '4H': 30 * 60 * 1000,
    '6H': 60 * 60 * 1000,
    '12H': 2 * 60 * 60 * 1000,
    '1D': 4 * 60 * 60 * 1000,
    '1W': 24 * 60 * 60 * 1000,
    '1M': 7 * 24 * 60 * 60 * 1000,
  };

  constructor(config?: Partial<MarketDataConfig>) {
    // 默认配置
    this.config = {
      okx: {
        baseURL: 'https://www.okx.com',
        timeout: 10000,
        maxRetries: 3,
        retryDelay: 1000,
        ...config?.okx,
      },
      cache: {
        priceTTL: 5000,      // 5秒
        klineTTL: 60000,     // 1分钟
        indicatorTTL: 60000, // 1分钟
        maxEntries: 1000,
        ...config?.cache,
      },
      updateInterval: {
        price: 5000,         // 5秒更新价格
        kline: {
          ...this.updateIntervalMap,
          ...config?.updateInterval?.kline,
        },
      },
    };

    // 初始化组件
    this.okxApi = new OKXAPI(this.config.okx);
    this.cacheManager = new CacheManager(this.config.cache);
    this.indicatorCalculator = new IndicatorCalculator();

    logger.info('市场数据提供者初始化', {
      priceTTL: this.config.cache.priceTTL,
      klineTTL: this.config.cache.klineTTL,
    });
  }

  // =====================================================
  // 价格数据获取
  // =====================================================

  /**
   * 获取单个币种的价格
   */
  async fetchPrice(coin: string): Promise<PriceData> {
    // 检查缓存
    const cached = this.cacheManager.priceCache.get(coin);
    if (cached) {
      logger.debug(`价格缓存命中: ${coin}`);
      return cached;
    }

    // 从 API 获取
    logger.debug(`从 API 获取价格: ${coin}`);
    const ticker = await this.okxApi.getTicker(coin);
    const priceData = tickerToPriceData(ticker, coin);

    // 缓存
    this.cacheManager.priceCache.set(coin, priceData);

    return priceData;
  }

  /**
   * 批量获取价格
   */
  async fetchPrices(coins: string[]): Promise<Map<string, PriceData>> {
    const result = new Map<string, PriceData>();
    const toFetch: string[] = [];

    // 先从缓存获取
    for (const coin of coins) {
      const cached = this.cacheManager.priceCache.get(coin);
      if (cached) {
        result.set(coin, cached);
      } else {
        toFetch.push(coin);
      }
    }

    logger.debug(`价格缓存: ${result.size}/${coins.length} 命中，需要获取 ${toFetch.length} 个`);

    // 批量获取缺失的
    if (toFetch.length > 0) {
      const tickers = await this.okxApi.getBatchTickers(toFetch);

      for (const [coin, ticker] of tickers) {
        const priceData = tickerToPriceData(ticker, coin);
        result.set(coin, priceData);
        this.cacheManager.priceCache.set(coin, priceData);
      }
    }

    return result;
  }

  // =====================================================
  // K线数据获取
  // =====================================================

  /**
   * 获取K线数据
   */
  async fetchKLines(
    coin: string,
    interval: KLineInterval = '1H',
    limit: number = 100
  ): Promise<CandleData[]> {
    // 检查缓存
    const cached = this.cacheManager.klineCache.get(coin, interval);
    if (cached) {
      logger.debug(`K线缓存命中: ${coin} ${interval}`);
      return cached;
    }

    // 从 API 获取
    logger.debug(`从 API 获取K线: ${coin} ${interval} limit=${limit}`);
    const rawData = await this.okxApi.getCandles(coin, interval, limit);

    // 转换并按时间排序（旧到新）
    const candles = rawData
      .map(klineToCandleData)
      .sort((a, b) => a.timestamp - b.timestamp);

    // 缓存
    this.cacheManager.klineCache.set(coin, interval, candles);

    return candles;
  }

  /**
   * 批量获取K线数据
   */
  async fetchBatchKLines(
    coins: string[],
    interval: KLineInterval = '1H',
    limit: number = 100
  ): Promise<Map<string, CandleData[]>> {
    const result = new Map<string, CandleData[]>();
    const toFetch: string[] = [];

    // 先从缓存获取
    for (const coin of coins) {
      const cached = this.cacheManager.klineCache.get(coin, interval);
      if (cached) {
        result.set(coin, cached);
      } else {
        toFetch.push(coin);
      }
    }

    logger.debug(`K线缓存: ${result.size}/${coins.length} 命中，需要获取 ${toFetch.length} 个`);

    // 批量获取缺失的
    if (toFetch.length > 0) {
      const rawDataMap = await this.okxApi.getBatchCandles(toFetch, interval, limit);

      for (const [coin, rawData] of rawDataMap) {
        const candles = rawData
          .map(klineToCandleData)
          .sort((a, b) => a.timestamp - b.timestamp);

        result.set(coin, candles);
        this.cacheManager.klineCache.set(coin, interval, candles);
      }
    }

    return result;
  }

  // =====================================================
  // 技术指标获取
  // =====================================================

  /**
   * 获取技术指标
   */
  async fetchIndicators(
    coin: string,
    interval: KLineInterval = '1H',
    klineLimit: number = 100
  ): Promise<TechnicalIndicators> {
    // 检查缓存
    const cached = this.cacheManager.indicatorCache.get(coin, interval);
    if (cached) {
      logger.debug(`指标缓存命中: ${coin} ${interval}`);
      return cached;
    }

    // 获取K线数据
    const klines = await this.fetchKLines(coin, interval, klineLimit);

    // 验证K线数据
    if (!this.indicatorCalculator.validateKlines(klines)) {
      throw new Error(`K线数据无效: ${coin}`);
    }

    // 计算指标
    logger.debug(`计算技术指标: ${coin} ${interval}`);
    const indicators = this.indicatorCalculator.calculateAll(klines);

    // 缓存
    this.cacheManager.indicatorCache.set(coin, interval, indicators);

    return indicators;
  }

  /**
   * 批量获取技术指标
   */
  async fetchBatchIndicators(
    coins: string[],
    interval: KLineInterval = '1H',
    klineLimit: number = 100
  ): Promise<Map<string, TechnicalIndicators>> {
    const result = new Map<string, TechnicalIndicators>();
    const toCalculate: string[] = [];

    // 先从缓存获取
    for (const coin of coins) {
      const cached = this.cacheManager.indicatorCache.get(coin, interval);
      if (cached) {
        result.set(coin, cached);
      } else {
        toCalculate.push(coin);
      }
    }

    logger.debug(`指标缓存: ${result.size}/${coins.length} 命中，需要计算 ${toCalculate.length} 个`);

    // 批量计算缺失的
    if (toCalculate.length > 0) {
      // 获取K线
      const klinesMap = await this.fetchBatchKLines(toCalculate, interval, klineLimit);

      // 批量计算指标
      const indicators = this.indicatorCalculator.calculateBatch(klinesMap);

      for (const [coin, data] of indicators) {
        result.set(coin, data);
        this.cacheManager.indicatorCache.set(coin, interval, data);
      }
    }

    return result;
  }

  // =====================================================
  // 市场上下文
  // =====================================================

  /**
   * 获取完整市场上下文
   */
  async fetchMarketContext(
    coins: string[],
    options: MarketContextOptions = {}
  ): Promise<MarketContext> {
    const {
      includeKLines = true,
      klineInterval = '1H',
      klineLimit = 100,
      includeIndicators = true,
    } = options;

    logger.info('获取市场上下文', {
      coins,
      includeKLines,
      klineInterval,
      includeIndicators,
    });

    const startTime = Date.now();

    // 1. 获取价格数据
    const prices = await this.fetchPrices(coins);

    // 2. 获取K线数据
    const klines = new Map<string, CandleData[]>();
    if (includeKLines) {
      const klinesData = await this.fetchBatchKLines(coins, klineInterval, klineLimit);
      for (const [coin, data] of klinesData) {
        klines.set(coin, data);
      }
    }

    // 3. 获取技术指标
    const indicators = new Map<string, TechnicalIndicators>();
    if (includeIndicators) {
      const indicatorsData = await this.fetchBatchIndicators(coins, klineInterval, klineLimit);
      for (const [coin, data] of indicatorsData) {
        indicators.set(coin, data);
      }
    }

    // 4. 检查市场状态
    const isMarketNormal = this.checkMarketNormal(prices, indicators);

    const elapsed = Date.now() - startTime;
    logger.info('市场上下文获取完成', {
      priceCount: prices.size,
      klineCount: klines.size,
      indicatorCount: indicators.size,
      elapsed: `${elapsed}ms`,
    });

    return {
      prices,
      klines,
      indicators,
      isMarketNormal,
      timestamp: Date.now(),
    };
  }

  /**
   * 检查市场是否正常
   */
  private checkMarketNormal(
    prices: Map<string, PriceData>,
    indicators: Map<string, TechnicalIndicators>
  ): boolean {
    // 检查价格数据是否有效
    for (const [coin, price] of prices) {
      // 检查价格是否为正数
      if (price.price <= 0) {
        logger.warn(`市场异常: ${coin} 价格为负数`);
        return false;
      }

      // 检查24h涨跌幅是否异常（超过50%）
      if (Math.abs(price.change24h) > 50) {
        logger.warn(`市场异常: ${coin} 24h涨跌幅过大`, {
          change24h: price.change24h,
        });
        return false;
      }
    }

    // 检查技术指标是否有效
    for (const [coin, indicator] of indicators) {
      // 检查RSI是否在有效范围内
      if (indicator.rsi < 0 || indicator.rsi > 100) {
        logger.warn(`市场异常: ${coin} RSI无效`, { rsi: indicator.rsi });
        return false;
      }

      // 检查布林带是否有效
      if (indicator.bollinger.lower >= indicator.bollinger.upper) {
        logger.warn(`市场异常: ${coin} 布林带无效`);
        return false;
      }
    }

    return true;
  }

  // =====================================================
  // 缓存管理
  // =====================================================

  /**
   * 清除过期缓存
   */
  clearExpiredCache(): void {
    this.cacheManager.clearExpired();
  }

  /**
   * 清除所有缓存
   */
  clearAllCache(): void {
    this.cacheManager.clearAll();
  }

  /**
   * 获取缓存统计
   */
  getCacheStats() {
    return this.cacheManager.getAllStats();
  }

  /**
   * 打印缓存统计
   */
  logCacheStats(): void {
    this.cacheManager.logStats();
  }

  // =====================================================
  // 配置管理
  // =====================================================

  /**
   * 更新配置
   */
  updateConfig(config: Partial<MarketDataConfig>): void {
    this.config = {
      okx: { ...this.config.okx, ...config.okx },
      cache: { ...this.config.cache, ...config.cache },
      updateInterval: {
        price: config.updateInterval?.price ?? this.config.updateInterval.price,
        kline: {
          ...this.config.updateInterval.kline,
          ...config.updateInterval?.kline,
        },
      },
    };

    logger.info('市场数据配置已更新', this.config as unknown as Record<string, unknown>);
  }

  /**
   * 获取配置
   */
  getConfig(): Readonly<MarketDataConfig> {
    return { ...this.config };
  }
}
