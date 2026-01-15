/**
 * 市场数据提供者测试
 *
 * 测试功能：
 * - OKX API 交互
 * - 数据解析和转换
 * - 缓存管理
 * - 技术指标计算
 * - 完整数据流
 */

import { describe, test, expect, beforeEach, mock } from 'bun:test';
import {
  MarketDataProvider,
  OKXAPI,
  PriceCache,
  KLineCache,
  IndicatorCache,
  IndicatorCalculator,
  tickerToPriceData,
  klineToCandleData,
  type PriceData,
  type CandleData,
  type TechnicalIndicators,
} from '../../src/market';

// =====================================================
// Mock 数据
// =====================================================

const mockOKXTicker = {
  instId: 'BTC-USDT',
  last: '43500.50',
  lastSz: '0.5',
  askPx: '43501.00',
  bidPx: '43500.00',
  open24h: '42000.00',
  high24h: '44000.00',
  low24h: '41500.00',
  vol24h: '10000.5',
  volCcy24h: '100000000',
  ts: '1705320000000',
};

const mockOKXKLines: Array<[string, string, string, string, string, string, string]> = [
  ['1705312800000', '43000', '43200', '42800', '43100', '100', '4300000'],
  ['1705316400000', '43100', '43300', '43000', '43250', '120', '5184000'],
  ['1705320000000', '43250', '43400', '43150', '43300', '90', '3897000'],
  ['1705323600000', '43300', '43500', '43250', '43450', '110', '4762500'],
  ['1705327200000', '43450', '43600', '43400', '43550', '130', '5661750'],
];

/**
 * 生成测试用K线数据
 */
function generateTestKLines(count: number, startPrice: number = 43000): CandleData[] {
  const klines: CandleData[] = [];
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;

  for (let i = 0; i < count; i++) {
    const change = (Math.random() - 0.5) * 200; // ±100 变化
    const open = startPrice + change;
    const high = open + Math.random() * 50;
    const low = open - Math.random() * 50;
    const close = low + Math.random() * (high - low);

    klines.push({
      timestamp: now - (count - i) * hourMs,
      open,
      high,
      low,
      close,
      volume: 100 + Math.random() * 50,
      volumeCcy: (100 + Math.random() * 50) * close,
    });

    startPrice = close;
  }

  return klines;
}

/**
 * 生成测试用价格数据
 */
function generateTestPriceData(coin: string, price: number): PriceData {
  return {
    coin,
    price,
    change24h: (Math.random() - 0.5) * 10,
    high24h: price * 1.05,
    low24h: price * 0.95,
    volume24h: 1000000 + Math.random() * 500000,
    volumeCcy24h: 10000000 + Math.random() * 5000000,
    timestamp: Date.now(),
  };
}

// =====================================================
// OKX API 测试
// =====================================================

describe('OKXAPI', () => {
  let api: OKXAPI;
  let mockFetch: any;

  beforeEach(() => {
    api = new OKXAPI({
      baseURL: 'https://test.okx.com',
      timeout: 5000,
      maxRetries: 2,
      retryDelay: 100,
    });

    // Mock fetch
    mockFetch = mock(() => Promise.resolve(new Response('{}')));
    global.fetch = mockFetch;
  });

  test('应该成功获取单个币种行情', async () => {
    const responseBody = JSON.stringify({
      code: '0',
      msg: '',
      data: [mockOKXTicker],
    });

    mockFetch.mockResolvedValueOnce(
      new Response(responseBody, { status: 200 })
    );

    const ticker = await api.getTicker('BTC');

    expect(ticker.instId).toBe('BTC-USDT');
    expect(ticker.last).toBe('43500.50');
  });

  test('应该正确解析 ticker 数据', () => {
    const priceData = tickerToPriceData(mockOKXTicker, 'BTC');

    expect(priceData.coin).toBe('BTC');
    expect(priceData.price).toBe(43500.50);
    expect(priceData.change24h).toBeCloseTo(3.57, 1); // (43500.5 - 42000) / 42000 * 100
    expect(priceData.high24h).toBe(44000);
    expect(priceData.low24h).toBe(41500);
  });

  test('应该正确解析 K线数据', () => {
    const candle = klineToCandleData(mockOKXKLines[0]);

    expect(candle.timestamp).toBe(1705312800000);
    expect(candle.open).toBe(43000);
    expect(candle.high).toBe(43200);
    expect(candle.low).toBe(42800);
    expect(candle.close).toBe(43100);
    expect(candle.volume).toBe(100);
  });

  test('应该处理 API 错误响应', async () => {
    const responseBody = JSON.stringify({
      code: '50001',
      msg: 'Invalid symbol',
      data: [],
    });

    // 使用 mockResolvedValue 让所有重试都返回相同的错误响应
    mockFetch.mockResolvedValue(
      new Response(responseBody, { status: 200 })
    );

    // 重试失败后会抛出重试错误
    await expect(api.getTicker('INVALID')).rejects.toThrow('请求失败');
  });

  test('应该处理 HTTP 错误', async () => {
    // 使用 mockResolvedValue 让所有重试都返回相同的错误响应
    mockFetch.mockResolvedValue(
      new Response('Not Found', { status: 404 })
    );

    // 重试失败后会抛出重试错误
    await expect(api.getTicker('BTC')).rejects.toThrow('请求失败');
  });
});

// =====================================================
// 缓存测试
// =====================================================

describe('PriceCache', () => {
  test('应该缓存和检索价格数据', () => {
    const cache = new PriceCache(1000);
    const priceData = generateTestPriceData('BTC', 43500);

    // 设置缓存
    cache.set('BTC', priceData);

    // 获取缓存
    const retrieved = cache.get('BTC');
    expect(retrieved).toEqual(priceData);
  });

  test('应该在TTL后过期', async () => {
    const cache = new PriceCache(100); // 100ms TTL
    const priceData = generateTestPriceData('BTC', 43500);

    cache.set('BTC', priceData);

    // 立即获取应该命中
    expect(cache.get('BTC')).toEqual(priceData);

    // 等待过期
    await new Promise(resolve => setTimeout(resolve, 150));

    // 过期后应该返回 null
    expect(cache.get('BTC')).toBeNull();
  });

  test('应该正确统计命中率', () => {
    const cache = new PriceCache(1000);
    const priceData = generateTestPriceData('BTC', 43500);

    cache.set('BTC', priceData);

    // 命中
    cache.get('BTC');
    cache.get('BTC');

    // 未命中
    cache.get('ETH');

    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(0.667, 2);
  });

  test('应该清除过期条目', async () => {
    const cache = new PriceCache(50);
    const priceData = generateTestPriceData('BTC', 43500);

    cache.set('BTC', priceData);
    await new Promise(resolve => setTimeout(resolve, 100));

    const cleared = cache.clearExpired();
    expect(cleared).toBe(1);
    expect(cache.get('BTC')).toBeNull();
  });
});

describe('KLineCache', () => {
  test('应该缓存K线数据', () => {
    const cache = new KLineCache(1000);
    const klines = generateTestKLines(10);

    cache.set('BTC', '1H', klines);

    const retrieved = cache.get('BTC', '1H');
    expect(retrieved).toEqual(klines);
  });

  test('应该为不同周期分别缓存', () => {
    const cache = new KLineCache(1000);
    const klines1H = generateTestKLines(10);
    const klines4H = generateTestKLines(10);

    cache.set('BTC', '1H', klines1H);
    cache.set('BTC', '4H', klines4H);

    expect(cache.get('BTC', '1H')).toEqual(klines1H);
    expect(cache.get('BTC', '4H')).toEqual(klines4H);
    expect(cache.get('BTC', '1D')).toBeNull();
  });
});

describe('IndicatorCache', () => {
  test('应该缓存技术指标', () => {
    const klineCache = new KLineCache(1000);
    const indicatorCache = new IndicatorCache(1000, klineCache);

    // 添加 K线缓存，这样指标缓存就不会因为 K线失效而失效
    const klines = generateTestKLines(10);
    klineCache.set('BTC', '1H', klines);

    const indicators: TechnicalIndicators = {
      ma: { ma7: 43000, ma25: 42500, ma99: 42000 },
      rsi: 55,
      macd: { macd: 10, signal: 8, histogram: 2 },
      bollinger: { upper: 44000, middle: 43000, lower: 42000 },
    };

    indicatorCache.set('BTC', '1H', indicators);

    const retrieved = indicatorCache.get('BTC', '1H');
    expect(retrieved).toEqual(indicators);
  });
});

// =====================================================
// 技术指标计算测试
// =====================================================

describe('IndicatorCalculator', () => {
  let calculator: IndicatorCalculator;

  beforeEach(() => {
    calculator = new IndicatorCalculator();
  });

  test('应该正确计算 SMA', () => {
    const prices = [100, 102, 101, 103, 105];
    const sma5 = (calculator as any).calculateSMA(prices, 5);

    expect(sma5).toBeCloseTo(102.2, 1); // (100 + 102 + 101 + 103 + 105) / 5
  });

  test('应该正确计算 RSI', () => {
    // 创建上涨趋势的K线
    const klines: CandleData[] = [];
    for (let i = 0; i < 20; i++) {
      klines.push({
        timestamp: Date.now() - (20 - i) * 3600000,
        open: 100 + i * 2,
        high: 102 + i * 2,
        low: 99 + i * 2,
        close: 101 + i * 2,
        volume: 100,
        volumeCcy: 10000,
      });
    }

    const rsi = calculator.calculateRSI(klines, 14);

    // 上涨趋势应该有较高的 RSI
    expect(rsi).toBeGreaterThan(50);
    expect(rsi).toBeLessThanOrEqual(100);
  });

  test('应该正确计算 MACD', () => {
    const klines = generateTestKLines(100);
    const macd = calculator.calculateMACD(klines);

    // MACD 应该在合理范围内
    expect(Math.abs(macd.macd)).toBeLessThan(1000);
    expect(macd.histogram).toBeCloseTo(macd.macd - macd.signal, 4);
  });

  test('应该正确计算布林带', () => {
    const klines: CandleData[] = [];
    for (let i = 0; i < 30; i++) {
      klines.push({
        timestamp: Date.now() - (30 - i) * 3600000,
        open: 43000 + (Math.random() - 0.5) * 200,
        high: 43200 + (Math.random() - 0.5) * 200,
        low: 42800 + (Math.random() - 0.5) * 200,
        close: 43000 + (Math.random() - 0.5) * 200,
        volume: 100,
        volumeCcy: 4300000,
      });
    }

    const bollinger = calculator.calculateBollinger(klines, 20, 2);

    // 上轨应该大于中轨
    expect(bollinger.upper).toBeGreaterThan(bollinger.middle);
    // 下轨应该小于中轨
    expect(bollinger.lower).toBeLessThan(bollinger.middle);
  });

  test('应该计算所有指标', () => {
    const klines = generateTestKLines(100);
    const indicators = calculator.calculateAll(klines);

    expect(indicators.ma).toBeDefined();
    expect(indicators.rsi).toBeGreaterThanOrEqual(0);
    expect(indicators.rsi).toBeLessThanOrEqual(100);
    expect(indicators.macd).toBeDefined();
    expect(indicators.bollinger).toBeDefined();
  });

  test('应该验证K线数据', () => {
    const validKline: CandleData = {
      timestamp: Date.now(),
      open: 43000,
      high: 43200,
      low: 42800,
      close: 43100,
      volume: 100,
      volumeCcy: 4300000,
    };

    expect(calculator.validateKlines([validKline])).toBe(true);

    // 无效：high < low
    const invalidKline = { ...validKline, high: 42000 };
    expect(calculator.validateKlines([invalidKline])).toBe(false);
  });

  test('数据不足时应该抛出错误', () => {
    const klines = generateTestKLines(50); // 少于99根

    expect(() => calculator.calculateAll(klines)).toThrow('K线数据不足');
  });
});

// =====================================================
// 市场数据提供者集成测试
// =====================================================

describe('MarketDataProvider', () => {
  let provider: MarketDataProvider;
  let mockFetch: any;

  beforeEach(() => {
    provider = new MarketDataProvider({
      okx: {
        baseURL: 'https://test.okx.com',
        timeout: 5000,
        maxRetries: 1,
        retryDelay: 100,
      },
      cache: {
        priceTTL: 1000,
        klineTTL: 2000,
        indicatorTTL: 2000,
        maxEntries: 1000,
      },
    });

    // Mock fetch
    mockFetch = mock(() => Promise.resolve(new Response('{}')));
    global.fetch = mockFetch;
  });

  test('应该获取单个币种价格', async () => {
    const responseBody = JSON.stringify({
      code: '0',
      msg: '',
      data: [mockOKXTicker],
    });

    mockFetch.mockResolvedValueOnce(
      new Response(responseBody, { status: 200 })
    );

    const price = await provider.fetchPrice('BTC');

    expect(price.coin).toBe('BTC');
    expect(price.price).toBe(43500.50);
  });

  test('应该使用缓存', async () => {
    const responseBody = JSON.stringify({
      code: '0',
      msg: '',
      data: [mockOKXTicker],
    });

    mockFetch.mockResolvedValueOnce(
      new Response(responseBody, { status: 200 })
    );

    // 第一次获取
    const price1 = await provider.fetchPrice('BTC');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    // 第二次获取应该使用缓存
    const price2 = await provider.fetchPrice('BTC');
    expect(mockFetch).toHaveBeenCalledTimes(1); // 仍然是1次

    expect(price2).toEqual(price1);
  });

  test('应该批量获取价格', async () => {
    const responseBody = JSON.stringify({
      code: '0',
      msg: '',
      data: [
        mockOKXTicker,
        { ...mockOKXTicker, instId: 'ETH-USDT', last: '2300.00', open24h: '2250.00' },
      ],
    });

    // Mock 批量获取
    mockFetch.mockImplementation(async (url) => {
      if (url.includes('BTC')) {
        return new Response(JSON.stringify({ code: '0', msg: '', data: [mockOKXTicker] }), { status: 200 });
      } else if (url.includes('ETH')) {
        return new Response(JSON.stringify({ code: '0', msg: '', data: [{ ...mockOKXTicker, instId: 'ETH-USDT', last: '2300.00', open24h: '2250.00' }] }), { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });

    const prices = await provider.fetchPrices(['BTC', 'ETH']);

    expect(prices.size).toBe(2);
    expect(prices.get('BTC')?.price).toBe(43500.50);
    expect(prices.get('ETH')?.price).toBe(2300);
  });

  test('应该获取K线数据', async () => {
    const responseBody = JSON.stringify({
      code: '0',
      msg: '',
      data: mockOKXKLines,
    });

    mockFetch.mockResolvedValueOnce(
      new Response(responseBody, { status: 200 })
    );

    const klines = await provider.fetchKLines('BTC', '1H', 100);

    expect(klines).toHaveLength(5);
    expect(klines[0].open).toBe(43000);
  });

  test('应该获取技术指标', async () => {
    // 先 mock K线数据
    const manyKLines = Array.from({ length: 100 }, (_, i) => {
      const price = 43000 + i * 10;
      return [
        String(Date.now() - (100 - i) * 3600000),
        String(price),
        String(price + 50),
        String(price - 50),
        String(price + 20),
        '100',
        String(price * 100),
      ] as const;
    });

    const responseBody = JSON.stringify({
      code: '0',
      msg: '',
      data: manyKLines,
    });

    mockFetch.mockResolvedValueOnce(
      new Response(responseBody, { status: 200 })
    );

    const indicators = await provider.fetchIndicators('BTC', '1H', 100);

    expect(indicators.ma).toBeDefined();
    expect(indicators.rsi).toBeGreaterThanOrEqual(0);
    expect(indicators.rsi).toBeLessThanOrEqual(100);
    expect(indicators.macd).toBeDefined();
    expect(indicators.bollinger).toBeDefined();
  });

  test('应该获取完整市场上下文', async () => {
    // Mock 价格数据
    const tickerResponse = JSON.stringify({
      code: '0',
      msg: '',
      data: [mockOKXTicker],
    });

    // Mock K线数据
    const manyKLines = Array.from({ length: 100 }, (_, i) => {
      const price = 43000 + i * 10;
      return [
        String(Date.now() - (100 - i) * 3600000),
        String(price),
        String(price + 50),
        String(price - 50),
        String(price + 20),
        '100',
        String(price * 100),
      ] as const;
    });

    const klineResponse = JSON.stringify({
      code: '0',
      msg: '',
      data: manyKLines,
    });

    mockFetch.mockImplementation(async (url) => {
      if (url.includes('ticker')) {
        return new Response(tickerResponse, { status: 200 });
      } else if (url.includes('candles')) {
        return new Response(klineResponse, { status: 200 });
      }
      return new Response('{}', { status: 404 });
    });

    const context = await provider.fetchMarketContext(['BTC'], {
      includeKLines: true,
      includeIndicators: true,
      klineInterval: '1H',
      klineLimit: 100,
    });

    expect(context.prices.get('BTC')).toBeDefined();
    expect(context.klines.get('BTC')).toHaveLength(100);
    expect(context.indicators.get('BTC')).toBeDefined();
    expect(context.isMarketNormal).toBe(true);
    expect(context.timestamp).toBeGreaterThan(0);
  });

  test('应该检测异常市场', async () => {
    const abnormalTicker = {
      ...mockOKXTicker,
      last: '43500.50',
      open24h: '29000.00', // 24h涨幅超过50%
    };

    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ code: '0', msg: '', data: [abnormalTicker] }), { status: 200 })
    );

    const context = await provider.fetchMarketContext(['BTC'], {
      includeKLines: false,
      includeIndicators: false,
    });

    expect(context.isMarketNormal).toBe(false);
  });
});
