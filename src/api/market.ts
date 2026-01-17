/**
 * 市场 API 兼容层
 *
 * 此模块保留用于向后兼容，内部委托给新的 market/okx-api.ts
 * 建议新代码直接使用 OKXAPI 或 MarketDataProvider
 *
 * @deprecated 请使用 src/market/okx-api.ts 中的 OKXAPI 类
 */

import { OKXAPI, tickerToPriceData, klineToCandleData, parseCandle, candleToNumberFormat, safeParseNumber } from '../market/okx-api';
import type {
  Ticker,
  CandleRaw,
  CandleNumber,
  OrderBook,
  OrderBookParams,
  OrderBookWithNum,
  Trade,
  TradesParams,
  KLineInterval,
} from '../market';
import type { BarSize } from '../core/constants';

// =====================================================
// 类型定义
// =====================================================

export type { OkxAuth as OkxAuthType } from '../core/auth';

export interface CandlesParams {
  instId: string;
  bar?: BarSize;
  after?: string;
  before?: string;
  limit?: string;
}

export interface Volume {
  volCcy: string;
  volUsd: string;
}

// =====================================================
// MarketApi 兼容类
// =====================================================

/**
 * @deprecated 请使用 OKXAPI 替代
 * 市场数据 API 兼容包装器，委托给新的 OKXAPI 实现
 */
export class MarketApi {
  private okxApi: OKXAPI;

  constructor(_auth?: unknown, isDemo = true, proxy?: string) {
    // 忽略 auth 和 isDemo 参数，新 API 不需要它们
    const baseURL = isDemo ? 'https://www.okx.com' : 'https://www.okx.com';
    this.okxApi = new OKXAPI({ baseURL });

    if (proxy) {
      process.env.HTTPS_PROXY = proxy;
      process.env.HTTP_PROXY = proxy;
    }
  }

  /**
   * 获取所有产品行情
   */
  async getTickers(instType?: string, instId?: string): Promise<Ticker[]> {
    return this.okxApi.getTickers(instType, instId);
  }

  /**
   * 获取单个产品行情
   */
  async getTicker(instId: string): Promise<Ticker[]> {
    const result = await this.okxApi.getTicker(instId);
    return [result];
  }

  /**
   * 获取当前最优挂单
   */
  async getBestBidAsk(instId: string): Promise<{ bidPrice: number; askPrice: number; bidSize: number; askSize: number } | null> {
    const ticker = await this.getTicker(instId);
    if (ticker.length === 0) return null;

    const t = ticker[0];
    if (!t) return null;
    return {
      bidPrice: parseFloat(t.bidPx),
      askPrice: parseFloat(t.askPx),
      bidSize: parseFloat(t.bidSz || '0'),
      askSize: parseFloat(t.askSz || '0')
    };
  }

  /**
   * 获取产品 K 线数据
   */
  async getCandles(params: CandlesParams): Promise<CandleRaw[]> {
    const instId = params.instId.replace('-USDT', '');
    return this.okxApi.getCandles(instId, params.bar as KLineInterval || '1H', parseInt(params.limit || '100'));
  }

  /**
   * 获取最新的 N 条 K 线数据
   */
  async getLatestCandles(instId: string, bar: BarSize = '1H', limit = 100): Promise<CandleNumber[]> {
    const raw = await this.getCandles({ instId, bar, limit: limit.toString() });
    const candles = raw.map(parseCandle);
    return candles.map(candleToNumberFormat);
  }

  /**
   * 获取 K 线数据（指定时间范围）
   */
  async getCandlesBefore(instId: string, bar: BarSize, after: string): Promise<CandleNumber[]> {
    const raw = await this.getCandles({ instId, bar, after });
    const candles = raw.map(parseCandle);
    return candles.map(candleToNumberFormat);
  }

  /**
   * 获取 K 线数据（指定时间范围）
   */
  async getCandlesAfter(instId: string, bar: BarSize, before: string): Promise<CandleNumber[]> {
    const raw = await this.getCandles({ instId, bar, before });
    const candles = raw.map(parseCandle);
    return candles.map(candleToNumberFormat);
  }

  /**
   * 获取产品深度数据
   */
  async getOrderBook(params: OrderBookParams): Promise<OrderBook> {
    return this.okxApi.getOrderBook(params);
  }

  /**
   * 获取深度快照书籍数据
   */
  async getOrderBookSnapshot(instId: string, sz = 1): Promise<OrderBookWithNum> {
    return this.okxApi.getOrderBookSnapshot(instId, sz);
  }

  /**
   * 获取深度数据（含订单数）
   */
  async getOrderBookWithOrders(instId: string, sz = 25): Promise<OrderBookWithNum> {
    return this.okxApi.getOrderBookWithOrders(instId, sz);
  }

  /**
   * 获取所有交易产品的公共频道成交数据
   */
  async getTrades(params: TradesParams): Promise<Trade[]> {
    return this.okxApi.getTrades(params);
  }

  /**
   * 获取最新成交记录
   */
  async getLatestTrades(instId: string, limit = 100): Promise<Trade[]> {
    return this.okxApi.getLatestTrades(instId, limit);
  }

  /**
   * 获取 24 小时总成交量
   */
  async getVolume(): Promise<Volume> {
    const result = await this.okxApi.getVolume();
    return {
      volCcy: result.volCcy.toString(),
      volUsd: result.volUsd.toString()
    };
  }

  /**
   * 获取数据倒计时（即将到期的交割/行权合约）
   * @deprecated 此方法不再可用，OKX API 端点已变更
   */
  async getDeliveryExerciseHistory(): Promise<{ instId: string; type: string; ts: string }[]> {
    throw new Error('getDeliveryExerciseHistory is no longer supported');
  }

  /**
   * 获取持仓总量
   * @deprecated 此方法不再可用，需要认证
   */
  async getOpenInterest(_instType?: string, _instId?: string): Promise<{ instId: string; openInt: string; ts: string }[]> {
    throw new Error('getOpenInterest requires authentication, use authenticated API instead');
  }

  /**
   * 计算价格变动
   */
  async getPriceChange(instId: string): Promise<{
    price: number;
    change24h: number;
    changePercent24h: number;
    high24h: number;
    low24h: number;
  } | null> {
    const ticker = await this.getTicker(instId);
    if (ticker.length === 0) return null;

    const t = ticker[0];
    if (!t) return null;

    const price = parseFloat(t.last);
    const open24h = parseFloat(t.open24h);
    const change24h = price - open24h;
    const changePercent24h = (change24h / open24h) * 100;

    return {
      price,
      change24h,
      changePercent24h,
      high24h: parseFloat(t.high24h),
      low24h: parseFloat(t.low24h)
    };
  }

  /**
   * 计算平均价格（基于订单簿）
   */
  async getAveragePrice(instId: string, side: 'buy' | 'sell', amount: number): Promise<number | null> {
    const orderBook = await this.getOrderBook({ instId, sz: 25 });
    const orders = side === 'buy' ? orderBook.asks : orderBook.bids;

    let remaining = amount;
    let totalCost = 0;

    for (const [price, size] of orders) {
      const priceNum = parseFloat(price);
      const sizeNum = parseFloat(size);

      if (remaining <= 0) break;

      const take = Math.min(remaining, sizeNum);
      totalCost += take * priceNum;
      remaining -= take;
    }

    if (remaining > 0) {
      // 订单簿深度不足
      return null;
    }

    return totalCost / amount;
  }

  /**
   * 批量获取最优买卖价
   */
  async getBatchBestBidAsk(instIds: string[]): Promise<Map<string, { bidPrice: number; askPrice: number; bidSize: number; askSize: number }>> {
    const result = new Map();

    for (const instId of instIds) {
      const bidAsk = await this.getBestBidAsk(instId);
      if (bidAsk) {
        result.set(instId, bidAsk);
      }
    }

    return result;
  }

  /**
   * 获取市场概览（所有现货交易对）
   */
  async getMarketOverview(): Promise<Array<{ instId: string; price: number; change24h: number; volume24h: number }>> {
    const tickers = await this.getTickers('SPOT');

    return tickers
      .filter(t => t.instId.endsWith('-USDT'))
      .map(t => ({
        instId: t.instId,
        price: parseFloat(t.last),
        change24h: t.open24h ? ((parseFloat(t.last) - parseFloat(t.open24h)) / parseFloat(t.open24h)) * 100 : 0,
        volume24h: parseFloat(t.volCcy24h || '0')
      }))
      .sort((a, b) => b.volume24h - a.volume24h);
  }
}

// =====================================================
// 工厂函数
// =====================================================

/**
 * @deprecated 请直接使用 new OKXAPI() 替代
 * 创建 MarketApi 实例
 */
export function createMarketApi(auth?: unknown, isDemo = true, proxy?: string): MarketApi {
  return new MarketApi(auth, isDemo, proxy);
}

// =====================================================
// 重新导出类型和工具函数
// =====================================================

export type {
  Ticker,
  CandleRaw,
  CandleNumber,
  OrderBook,
  OrderBookParams,
  OrderBookWithNum,
  Trade,
  TradesParams,
  KLineInterval,
};

export {
  tickerToPriceData,
  klineToCandleData,
  parseCandle,
  candleToNumberFormat,
  safeParseNumber,
};
