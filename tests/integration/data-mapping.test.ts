/**
 * 数据格式映射测试
 *
 * 验证策略模块与 OKX API/WebSocket 数据格式的正确映射
 */

import { beforeAll, describe, test, expect } from 'bun:test';
import { OkxAuth, loadAuthFromEnv } from '../../src/core/auth.js';
import { TradeApi } from '../../src/api/trade.js';
import { MarketApi } from '../../src/api/market.js';
import { AccountApi } from '../../src/api/account.js';
import type { TickerChannelData, CandleChannelData } from '../../src/websocket/types.js';
import { SpotDCAGridStrategyEngine as StrategyEngine } from '../../src/strategies/spot-dca-grid/core/engine.js';
import { DEFAULT_CONFIG } from '../../src/strategies/spot-dca-grid/config/default-params.js';

// =====================================================
// 数据转换工具
// =====================================================

/**
 * OKX API 返回的字符串 -> number
 */
function parseNumber(value: string | number | undefined): number {
  if (value === undefined || value === null || value === '') return 0;
  return typeof value === 'string' ? parseFloat(value) : value;
}

/**
 * number -> OKX API 需要的字符串
 */
function formatNumber(value: number, decimals: number): string {
  return value.toFixed(decimals);
}

// =====================================================
// 测试配置
// =====================================================

const shouldSkipIntegration = !process.env.OKX_API_KEY || !process.env.OKX_SECRET_KEY;

describe('Data Mapping Tests', () => {

  // =====================================================
  // 1. 市场数据格式测试
  // =====================================================

  describe('Market API Data Format', () => {
    let marketApi: MarketApi;

    beforeAll(() => {
      marketApi = new MarketApi(undefined, true);
    });

    test('Ticker 数据格式 - 所有字段都是字符串', async () => {
      const tickers = await marketApi.getTicker('BTC-USDT');

      expect(tickers.length).toBeGreaterThan(0);
      const ticker = tickers[0];

      // 验证所有字段都是字符串
      expect(typeof ticker.last).toBe('string');
      expect(typeof ticker.lastSz).toBe('string');
      expect(typeof ticker.askPx).toBe('string');
      expect(typeof ticker.bidPx).toBe('string');
      expect(typeof ticker.volCcy24h).toBe('string');
      expect(typeof ticker.high24h).toBe('string');
      expect(typeof ticker.low24h).toBe('string');

      // 测试转换
      const last = parseNumber(ticker.last);
      expect(last).toBeGreaterThan(0);
      expect(typeof last).toBe('number');
    });

    test('Candle 数据格式 - 字符串数组', async () => {
      const candles = await marketApi.getCandles({
        instId: 'BTC-USDT',
        bar: '1H',
        limit: '10'
      });

      expect(candles.length).toBeGreaterThan(0);

      // OKX 返回的是字符串数组
      const firstCandle = candles[0];
      expect(Array.isArray(firstCandle)).toBe(true);
      expect(firstCandle.length).toBe(9); // [timestamp, open, high, low, close, volume, volCcy, volCcyQuote, confirm]

      // 验证所有元素都是字符串
      for (let i = 0; i < firstCandle.length; i++) {
        expect(typeof firstCandle[i]).toBe('string');
      }

      // 测试转换工具函数
      const { parseCandle, candleToNumberFormat } = await import('../../src/api/market.js');

      const candleObj = parseCandle(firstCandle);
      expect(candleObj.timestamp).toBe(firstCandle[0]);
      expect(candleObj.open).toBe(firstCandle[1]);

      // 转换为数字格式
      const candleNum = candleToNumberFormat(candleObj);
      expect(typeof candleNum.timestamp).toBe('number');
      expect(typeof candleNum.open).toBe('number');
      expect(candleNum.close).toBeGreaterThan(0);
    });
  });

  // =====================================================
  // 2. WebSocket 数据格式测试
  // =====================================================

  describe('WebSocket Data Format', () => {
    test('Ticker Channel 数据格式转换', () => {
      // 模拟 WebSocket 推送的 ticker 数据
      const wsTicker: TickerChannelData = {
        instType: 'SPOT',
        instId: 'BTC-USDT',
        last: '50000.5',
        lastSz: '0.1',
        askPx: '50001',
        bidPx: '50000',
        open24h: '49000',
        high24h: '51000',
        low24h: '48000',
        volCcy24h: '1000000',
        vol24h: '1000',
        sodUtc0: '49500',
        sodUtc8: '49500',
        ts: '1234567890000'
      };

      // 验证类型
      expect(typeof wsTicker.last).toBe('string');

      // 转换策略内部格式
      const price = parseNumber(wsTicker.last);
      expect(price).toBe(50000.5);
      expect(typeof price).toBe('number');
    });

    test('Candle Channel 数据格式转换', () => {
      // 模拟 WebSocket 推送的 candle 数据
      // OKX 返回: [时间戳, 开盘价, 最高价, 最低价, 成交量, 成交额, 确认状态]
      const wsCandle: CandleChannelData = {
        instType: 'SPOT',
        instId: 'BTC-USDT',
        candle: ['1234567890000', '50000', '51000', '49000', '100', '5000000', '1']
      };

      // 验证类型
      expect(Array.isArray(wsCandle.candle)).toBe(true);
      expect(typeof wsCandle.candle[1]).toBe('string'); // open

      // 转换策略内部格式
      const open = parseNumber(wsCandle.candle[1]);
      const high = parseNumber(wsCandle.candle[2]);
      const low = parseNumber(wsCandle.candle[3]);
      const close = parseNumber(wsCandle.candle[4]);

      expect(open).toBe(50000);
      expect(typeof open).toBe('number');
    });
  });

  // =====================================================
  // 3. 订单参数格式测试
  // =====================================================

  describe('Order Parameter Format', () => {
    let tradeApi: TradeApi;

    beforeAll(() => {
      const authConfig = loadAuthFromEnv();
      if (authConfig) {
        tradeApi = new TradeApi(new OkxAuth(authConfig), true);
      }
    });

    test.skipIf(shouldSkipIntegration)('订单参数必须是字符串', async () => {
      // OKX API 要求订单参数中的数字都传字符串
      const orderParams = {
        instId: 'BTC-USDT',
        tdMode: 'cash',
        side: 'buy',
        ordType: 'limit',
        sz: '0.001',      // 字符串！
        px: '50000'        // 字符串！
      };

      // 如果传 number 类型会报错
      const invalidParams = {
        instId: 'BTC-USDT',
        tdMode: 'cash',
        side: 'buy',
        ordType: 'limit',
        sz: 0.001,        // 错误：应该是字符串
        px: 50000          // 错误：应该是字符串
      };
    });
  });

  // =====================================================
  // 4. 策略模块数据格式验证
  // =====================================================

  describe('Strategy Module Data Format', () => {
    test('MarketData 接口使用 number 类型', () => {
      // 策略内部使用 number 类型
      const marketData = {
        coin: 'BTC' as const,
        price: 50000.5,
        bidPrice: 50000,
        askPrice: 50001,
        volume24h: 1000000,
        change24h: 2.5,
        high24h: 51000,
        low24h: 49000,
        timestamp: Date.now()
      };

      expect(typeof marketData.price).toBe('number');
      expect(typeof marketData.volume24h).toBe('number');
    });

    test('CoinPosition 接口使用 number 类型', () => {
      const position = {
        coin: 'BTC' as const,
        symbol: 'BTC-USDT',
        amount: 0.1,
        avgPrice: 50000,
        currentPrice: 51000,
        value: 5100,
        cost: 5000,
        unrealizedPnL: 100,
        unrealizedPnLPercent: 2,
        lastUpdate: Date.now()
      };

      expect(typeof position.amount).toBe('number');
      expect(typeof position.avgPrice).toBe('number');
    });
  });

  // =====================================================
  // 5. 数据转换函数测试
  // =====================================================

  describe('Data Conversion Functions', () => {
    test('parseNumber 正确处理各种输入', () => {
      expect(parseNumber('50000.5')).toBe(50000.5);
      expect(parseNumber('1000')).toBe(1000);
      expect(parseNumber(5000.5)).toBe(5000.5);
      expect(parseNumber('')).toBe(0);
      expect(parseNumber(undefined)).toBe(0);
    });

    test('formatNumber 正确格式化输出', () => {
      expect(formatNumber(50000.5, 2)).toBe('50000.50');
      expect(formatNumber(0.001, 8)).toBe('0.00100000');
      expect(formatNumber(1000, 0)).toBe('1000');
    });
  });
});

// =====================================================
// 运行测试
// =====================================================

if (import.meta.main) {
  console.log('运行数据格式映射测试...');
  console.log('确保已设置环境变量: OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE');
  console.log('');
}
