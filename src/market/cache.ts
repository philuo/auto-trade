/**
 * 市场数据缓存管理
 *
 * 负责缓存价格、K线和技术指标数据，减少 API 调用
 */

import { logger } from '../utils/logger.js';
import type {
  PriceData,
  CandleData,
  TechnicalIndicators,
  CacheEntry,
  CacheStats,
  KLineInterval,
} from './types.js';

/**
 * 价格缓存
 */
export class PriceCache {
  private cache: Map<string, CacheEntry<PriceData>> = new Map();
  private ttl: number;
  private stats = { hits: 0, misses: 0 };

  constructor(ttl: number = 5000) {
    this.ttl = ttl;
  }

  /**
   * 获取价格数据
   */
  get(coin: string): PriceData | null {
    const entry = this.cache.get(coin);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // 检查是否过期
    const now = Date.now();
    if (now > entry.expireAt) {
      this.cache.delete(coin);
      this.stats.misses++;
      return null;
    }

    // 更新访问时间
    entry.lastAccessAt = now;
    this.stats.hits++;
    return entry.data;
  }

  /**
   * 设置价格数据
   */
  set(coin: string, data: PriceData): void {
    const now = Date.now();
    this.cache.set(coin, {
      data,
      expireAt: now + this.ttl,
      createdAt: now,
      lastAccessAt: now,
    });
  }

  /**
   * 批量设置
   */
  setMany(dataMap: Map<string, PriceData>): void {
    for (const [coin, data] of dataMap) {
      this.set(coin, data);
    }
  }

  /**
   * 检查是否需要更新
   */
  needsUpdate(coin: string): boolean {
    const entry = this.cache.get(coin);
    if (!entry) return true;

    const now = Date.now();
    return now > entry.expireAt;
  }

  /**
   * 清除过期条目
   */
  clearExpired(): number {
    const now = Date.now();
    let cleared = 0;

    for (const [coin, entry] of this.cache) {
      if (now > entry.expireAt) {
        this.cache.delete(coin);
        cleared++;
      }
    }

    if (cleared > 0) {
      logger.debug(`清除 ${cleared} 个过期价格缓存`);
    }

    return cleared;
  }

  /**
   * 清除所有
   */
  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0 };
  }

  /**
   * 获取统计
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      size: this.cache.size,
      totalBytes: this.cache.size * 200, // 估算
    };
  }

  /**
   * 获取所有缓存的币种
   */
  getCoins(): string[] {
    return Array.from(this.cache.keys());
  }
}

/**
 * K线缓存
 */
export class KLineCache {
  private cache: Map<string, CacheEntry<CandleData[]>> = new Map();
  private ttl: number;
  private stats = { hits: 0, misses: 0 };

  constructor(ttl: number = 60000) {
    this.ttl = ttl;
  }

  /**
   * 生成缓存键
   */
  private makeKey(coin: string, interval: KLineInterval): string {
    return `${coin}_${interval}`;
  }

  /**
   * 获取K线数据
   */
  get(coin: string, interval: KLineInterval): CandleData[] | null {
    const key = this.makeKey(coin, interval);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // 检查是否过期
    const now = Date.now();
    if (now > entry.expireAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    entry.lastAccessAt = now;
    this.stats.hits++;
    return entry.data;
  }

  /**
   * 设置K线数据
   */
  set(coin: string, interval: KLineInterval, data: CandleData[]): void {
    const key = this.makeKey(coin, interval);
    const now = Date.now();

    this.cache.set(key, {
      data,
      expireAt: now + this.ttl,
      createdAt: now,
      lastAccessAt: now,
    });
  }

  /**
   * 批量设置
   */
  setMany(dataMap: Map<string, CandleData[]>, interval: KLineInterval): void {
    for (const [coin, data] of dataMap) {
      this.set(coin, interval, data);
    }
  }

  /**
   * 检查是否需要更新
   */
  needsUpdate(coin: string, interval: KLineInterval): boolean {
    const key = this.makeKey(coin, interval);
    const entry = this.cache.get(key);

    if (!entry) return true;

    const now = Date.now();
    return now > entry.expireAt;
  }

  /**
   * 清除过期条目
   */
  clearExpired(): number {
    const now = Date.now();
    let cleared = 0;

    for (const [key, entry] of this.cache) {
      if (now > entry.expireAt) {
        this.cache.delete(key);
        cleared++;
      }
    }

    if (cleared > 0) {
      logger.debug(`清除 ${cleared} 个过期K线缓存`);
    }

    return cleared;
  }

  /**
   * 清除特定币种的所有缓存
   */
  clearCoin(coin: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${coin}_`)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 清除所有
   */
  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0 };
  }

  /**
   * 获取统计
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      size: this.cache.size,
      totalBytes: this.cache.size * 5000, // 估算（K线数据较大）
    };
  }
}

/**
 * 技术指标缓存
 */
export class IndicatorCache {
  private cache: Map<string, CacheEntry<TechnicalIndicators>> = new Map();
  private ttl: number;
  private klineCache: KLineCache;
  private stats = { hits: 0, misses: 0 };

  constructor(ttl: number = 60000, klineCache: KLineCache) {
    this.ttl = ttl;
    this.klineCache = klineCache;
  }

  /**
   * 生成缓存键
   */
  private makeKey(coin: string, interval: KLineInterval): string {
    return `ind_${coin}_${interval}`;
  }

  /**
   * 获取技术指标
   */
  get(coin: string, interval: KLineInterval): TechnicalIndicators | null {
    const key = this.makeKey(coin, interval);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // 检查对应的K线是否已更新
    if (this.klineCache.needsUpdate(coin, interval)) {
      // K线已更新，指标也失效
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    // 检查是否过期
    const now = Date.now();
    if (now > entry.expireAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return null;
    }

    entry.lastAccessAt = now;
    this.stats.hits++;
    return entry.data;
  }

  /**
   * 设置技术指标
   */
  set(coin: string, interval: KLineInterval, data: TechnicalIndicators): void {
    const key = this.makeKey(coin, interval);
    const now = Date.now();

    this.cache.set(key, {
      data,
      expireAt: now + this.ttl,
      createdAt: now,
      lastAccessAt: now,
    });
  }

  /**
   * 使特定币种的指标失效
   */
  invalidate(coin: string): void {
    for (const key of this.cache.keys()) {
      if (key.startsWith(`ind_${coin}_`)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 清除过期条目
   */
  clearExpired(): number {
    const now = Date.now();
    let cleared = 0;

    for (const [key, entry] of this.cache) {
      if (now > entry.expireAt) {
        this.cache.delete(key);
        cleared++;
      }
    }

    if (cleared > 0) {
      logger.debug(`清除 ${cleared} 个过期指标缓存`);
    }

    return cleared;
  }

  /**
   * 清除所有
   */
  clear(): void {
    this.cache.clear();
    this.stats = { hits: 0, misses: 0 };
  }

  /**
   * 获取统计
   */
  getStats(): CacheStats {
    const total = this.stats.hits + this.stats.misses;
    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate: total > 0 ? this.stats.hits / total : 0,
      size: this.cache.size,
      totalBytes: this.cache.size * 100, // 估算
    };
  }
}

/**
 * 缓存管理器（统一管理所有缓存）
 */
export class CacheManager {
  public readonly priceCache: PriceCache;
  public readonly klineCache: KLineCache;
  public readonly indicatorCache: IndicatorCache;

  constructor(config: {
    priceTTL?: number;
    klineTTL?: number;
    indicatorTTL?: number;
  } = {}) {
    this.priceCache = new PriceCache(config.priceTTL);
    this.klineCache = new KLineCache(config.klineTTL);
    this.indicatorCache = new IndicatorCache(
      config.indicatorTTL,
      this.klineCache
    );

    logger.info('缓存管理器初始化', {
      priceTTL: config.priceTTL,
      klineTTL: config.klineTTL,
      indicatorTTL: config.indicatorTTL,
    });
  }

  /**
   * 清除所有过期缓存
   */
  clearExpired(): void {
    this.priceCache.clearExpired();
    this.klineCache.clearExpired();
    this.indicatorCache.clearExpired();
  }

  /**
   * 清除所有缓存
   */
  clearAll(): void {
    this.priceCache.clear();
    this.klineCache.clear();
    this.indicatorCache.clear();
  }

  /**
   * 获取综合统计
   */
  getAllStats(): {
    price: CacheStats;
    kline: CacheStats;
    indicator: CacheStats;
  } {
    return {
      price: this.priceCache.getStats(),
      kline: this.klineCache.getStats(),
      indicator: this.indicatorCache.getStats(),
    };
  }

  /**
   * 打印缓存统计
   */
  logStats(): void {
    const stats = this.getAllStats();

    logger.info('缓存统计', {
      price: {
        size: stats.price.size,
        hitRate: `${(stats.price.hitRate * 100).toFixed(2)}%`,
      },
      kline: {
        size: stats.kline.size,
        hitRate: `${(stats.kline.hitRate * 100).toFixed(2)}%`,
      },
      indicator: {
        size: stats.indicator.size,
        hitRate: `${(stats.indicator.hitRate * 100).toFixed(2)}%`,
      },
    });
  }
}
