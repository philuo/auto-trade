/**
 * 数据适配器
 *
 * 负责 OKX API 数据格式与策略模块数据格式之间的转换
 *
 * 关键点：
 * - OKX API 返回的是字符串类型
 * - 策略模块使用的是 number 类型
 * - 需要进行正确的类型转换
 */

import type { AllowedCoin } from '../config/strategy-config.js';
import type { Candle as StrategyCandle, MarketData, CoinPosition } from '../config/types.js';
import type { Ticker, Candle as ApiCandle, CandleRaw } from '../../../api/market.js';
import type { BalanceInfo } from '../../../api/account.js';
import { parseCandle, candleToNumberFormat, safeParseNumber } from '../../../api/market.js';

// =====================================================
// 数据转换器
// =====================================================

/**
 * 数据适配器类
 */
export class DataAdapter {
  /**
   * 将 OKX Ticker 数据转换为策略模块的 MarketData 格式
   */
  static tickerToMarketData(ticker: Ticker, coin: AllowedCoin): MarketData {
    const last = parseFloat(ticker.last);
    const open24h = parseFloat(ticker.open24h);

    return {
      symbol: `${coin}-USDT`,
      coin,
      timestamp: parseInt(ticker.ts, 10),
      price: last,
      bidPrice: parseFloat(ticker.bidPx || '0'),
      askPrice: parseFloat(ticker.askPx || '0'),
      high24h: parseFloat(ticker.high24h),
      low24h: parseFloat(ticker.low24h),
      volume24h: parseFloat(ticker.volCcy24h || '0'),
      change24h: last - open24h,
      changePercent24h: ((last - open24h) / open24h) * 100
    };
  }

  /**
   * 将 OKX 原始 Candle 数组转换为策略模块的 Candle 格式
   * OKX 返回格式: [timestamp, open, high, low, close, volume, volCcy, volCcyQuote, confirm]
   */
  static candleRawToStrategy(raw: CandleRaw): StrategyCandle {
    return {
      timestamp: parseInt(raw[0], 10),
      open: parseFloat(raw[1]),
      high: parseFloat(raw[2]),
      low: parseFloat(raw[3]),
      close: parseFloat(raw[4]),
      volume: parseFloat(raw[5]),
      volumeCcy: parseFloat(raw[6]),
      volCcyQuote: parseFloat(raw[7]),
      confirm: raw[8] === '1'
    };
  }

  /**
   * 批量转换 Candle 数组
   */
  static candleRawArrayToStrategy(rawArray: CandleRaw[]): StrategyCandle[] {
    return rawArray.map(this.candleRawToStrategy);
  }

  /**
   * 将 OKX Candle 对象转换为策略模块的 Candle 格式
   * (如果 API 返回的是解析后的对象格式)
   */
  static candleToStrategy(candle: ApiCandle): StrategyCandle {
    return {
      timestamp: parseInt(candle.timestamp, 10),
      open: parseFloat(candle.open),
      high: parseFloat(candle.high),
      low: parseFloat(candle.low),
      close: parseFloat(candle.close),
      volume: parseFloat(candle.volume),
      volumeCcy: parseFloat(candle.volCcy)
    };
  }

  /**
   * 将 OKX Balance 数据转换为策略模块的 CoinPosition 格式
   */
  static balanceToPosition(
    balance: BalanceInfo,
    coin: AllowedCoin,
    currentPrice: number,
    symbol: string
  ): CoinPosition | null {
    const availBal = parseFloat(balance.availBal);
    const frozenBal = parseFloat(balance.frozenBal);
    const totalBal = parseFloat(balance.bal);

    if (totalBal === 0) {
      return null;
    }

    const amount = availBal;
    const value = amount * currentPrice;
    const cost = value; // OKX 不提供成本信息，使用当前价值作为近似

    return {
      coin,
      symbol,
      amount,
      avgPrice: currentPrice, // 没有成本价信息，使用当前价
      currentPrice,
      value,
      cost,
      unrealizedPnL: 0, // 现货没有未实现盈亏概念
      unrealizedPnLPercent: 0,
      lastUpdate: Date.now()
    };
  }

  /**
   * 将多个 Balance 转换为 CoinPosition 数组
   */
  static balancesToPositions(
    balances: BalanceInfo[],
    prices: Map<string, number>
  ): CoinPosition[] {
    const positions: CoinPosition[] = [];

    for (const balance of balances) {
      const coin = balance.ccy as AllowedCoin;
      const price = prices.get(coin) || 0;

      if (price === 0) continue;

      const position = this.balanceToPosition(balance, coin, price, `${coin}-USDT`);
      if (position) {
        positions.push(position);
      }
    }

    return positions;
  }

  // =====================================================
  // 反向转换（策略 -> API）
  // =====================================================

  /**
   * 格式化订单价格（number -> string）
   * OKX API 要求订单参数中的数字都传字符串
   */
  static formatPrice(price: number, decimals: number = 2): string {
    return price.toFixed(decimals);
  }

  /**
   * 格式化订单数量（number -> string）
   */
  static formatSize(size: number, decimals: number = 8): string {
    return size.toFixed(decimals);
  }

  /**
   * 根据币种确定价格精度
   */
  static getPricePrecision(coin: AllowedCoin): number {
    const precisions: Record<string, number> = {
      'BTC': 2,
      'ETH': 2,
      'BNB': 2,
      'SOL': 2,
      'XRP': 4,
      'ADA': 4,
      'DOGE': 5
    };
    return precisions[coin] || 2;
  }

  /**
   * 根据币种确定数量精度
   */
  static getSizePrecision(coin: AllowedCoin): number {
    const precisions: Record<string, number> = {
      'BTC': 8,
      'ETH': 8,
      'BNB': 8,
      'SOL': 8,
      'XRP': 8,
      'ADA': 8,
      'DOGE': 8
    };
    return precisions[coin] || 8;
  }
}

// =====================================================
// 导出工具函数
// =====================================================

export const candleRawToStrategy = DataAdapter.candleRawToStrategy.bind(DataAdapter);
export const candleRawArrayToStrategy = DataAdapter.candleRawArrayToStrategy.bind(DataAdapter);
export const balanceToPosition = DataAdapter.balanceToPosition.bind(DataAdapter);
export const formatPrice = DataAdapter.formatPrice.bind(DataAdapter);
export const formatSize = DataAdapter.formatSize.bind(DataAdapter);
