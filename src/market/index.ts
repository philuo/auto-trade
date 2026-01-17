/**
 * 市场数据模块入口
 *
 * 导出市场数据相关的类型、类和函数
 */

// 类型定义
export type {
  PriceData,
  CandleData,
  TechnicalIndicators,
  MarketContext,
  MarketContextOptions,
  MarketDataConfig,
  KLineInterval,
  TechnicalSignal,
  ValidatedSignal,
  CacheEntry,
  CacheStats,
  OKXResponse,
  OKXTicker,
  OKXKLineData,
} from './types';

// 错误类
export {
  MarketDataError,
  APIRequestError,
  DataParseError,
  CacheError,
} from './types';

// OKX API
export { OKXAPI, tickerToPriceData, klineToCandleData } from './okx-api';

// 缓存
export {
  PriceCache,
  KLineCache,
  IndicatorCache,
  CacheManager,
} from './cache';

// 技术指标计算
export { IndicatorCalculator } from './indicators';

// 市场数据提供者
export { MarketDataProvider } from './provider';
