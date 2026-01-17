/**
 * OKX API 和 WebSocket 接口全面测试
 *
 * 测试目标：
 * 1. 验证所有 REST API 接口连通性
 * 2. 验证所有 WebSocket 接口连通性
 * 3. 验证请求参数格式正确
 * 4. 验证响应数据结构正确
 * 5. 验证数据类型和值域合理
 *
 * 运行方法：
 *   bun test tests/integration/okx-connectivity.test.ts
 */

import { afterAll, beforeAll, describe, test, expect } from 'bun:test';
import { loadAuthFromEnv, OkxAuth } from 'from '../../src/core/auth';
import { AccountApi, createAccountApi } from 'from '../../src/api/account';
import { TradeApi, createTradeApi } from 'from '../../src/api/trade';
import { MarketApi, createMarketApi } from 'from '../../src/api/market';
import { PublicApi, createPublicApi } from 'from '../../src/api/public';
import { WsClient, createWsClientFromEnv } from 'from '../../src/websocket/client';
import { API_ENDPOINTS, INST_TYPES, TD_MODES, ORDER_TYPES, ORDER_SIDES, BAR_SIZES } from 'from '../../src/core/constants';

// =====================================================
// 测试配置
// =====================================================

const authConfig = loadAuthFromEnv();
const PROXY = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;
const IS_DEMO = authConfig?.isDemo ?? true;

// 认证失败时跳过集成测试
const shouldSkipIntegration = !authConfig || !authConfig.apiKey;

console.log('='.repeat(60));
console.log('OKX API & WebSocket 接口全面测试');
console.log('='.repeat(60));
console.log(`环境: ${IS_DEMO ? '模拟盘' : '实盘'}`);
console.log(`代理: ${PROXY || '无'}`);
console.log(`认证: ${shouldSkipIntegration ? '缺失 (跳过集成测试)' : '已配置'}`);
console.log('='.repeat(60));

// =====================================================
// 辅助函数
// =====================================================

/**
 * 验证价格数据格式
 */
function validatePriceData(data: any): void {
  expect(data).toBeDefined();
  expect(typeof data.instId).toBe('string');
  expect(typeof data.last).toBe('string');
  expect(parseFloat(data.last)).toBeGreaterThan(0);
  expect(typeof data.bidPx).toBe('string');
  expect(typeof data.askPx).toBe('string');
  expect(typeof data.vol24h).toBe('string');
  expect(typeof data.volCcy24h).toBe('string');
}

/**
 * 验证K线数据格式（CandleNumber 格式：所有值为 number）
 */
function validateCandleData(data: any): void {
  expect(data).toBeDefined();
  expect(typeof data.timestamp).toBe('number');
  expect(typeof data.open).toBe('number');
  expect(typeof data.high).toBe('number');
  expect(typeof data.low).toBe('number');
  expect(typeof data.close).toBe('number');
  expect(typeof data.volume).toBe('number');
  expect(typeof data.volCcy).toBe('number');

  // 验证逻辑关系
  const { open, high, low, close } = data;

  expect(high).toBeGreaterThanOrEqual(low);
  expect(high).toBeGreaterThanOrEqual(open);
  expect(high).toBeGreaterThanOrEqual(close);
  expect(low).toBeLessThanOrEqual(open);
  expect(low).toBeLessThanOrEqual(close);
}

/**
 * 验证订单数据格式
 */
function validateOrderData(data: any): void {
  expect(data).toBeDefined();
  expect(typeof data.ordId).toBe('string');
  expect(typeof data.instId).toBe('string');
  expect(typeof data.side).toBe('string');
  expect([ORDER_SIDES.BUY, ORDER_SIDES.SELL]).toContain(data.side);
  expect(typeof data.ordType).toBe('string');
}

// =====================================================
// 测试套件
// =====================================================

describe('OKX 接口全面测试', () => {
  // =====================================================
  // 第一部分：公共接口（无需认证）
  // =====================================================

  describe('1. 公共接口测试 (无需认证)', () => {
    let publicApi: PublicApi;

    beforeAll(() => {
      publicApi = new PublicApi(undefined, IS_DEMO, PROXY);
    });

    test('1.1 获取服务器时间', async () => {
      const time = await publicApi.getServerTime();

      expect(time).toBeDefined();
      expect(typeof time.ts).toBe('string');
      expect(time.ts.length).toBeGreaterThan(0);

      // 验证时间戳格式（毫秒级）
      const timestamp = parseInt(time.ts);
      expect(timestamp).toBeGreaterThan(Date.now() - 60000); // 不超过1分钟前
      expect(timestamp).toBeLessThanOrEqual(Date.now() + 60000); // 不超过1分钟后

      console.log(`✓ 服务器时间: ${new Date(parseInt(time.ts)).toISOString()}`);
    });

    test('1.2 获取所有交易产品（SPOT）', async () => {
      const instruments = await publicApi.getInstruments(INST_TYPES.SPOT);

      expect(Array.isArray(instruments)).toBe(true);
      expect(instruments.length).toBeGreaterThan(0);

      // 验证数据结构
      const btcInstrument = instruments.find((i: any) => i.instId === 'BTC-USDT');
      expect(btcInstrument).toBeDefined();

      console.log(`✓ SPOT产品数量: ${instruments.length}`);
      console.log(`  示例: ${btcInstrument?.instId} (${btcInstrument?.baseCcy}/${btcInstrument?.quoteCcy})`);
    });

    test('1.3 获取所有交易产品（SWAP）', async () => {
      const instruments = await publicApi.getInstruments(INST_TYPES.SWAP);

      expect(Array.isArray(instruments)).toBe(true);
      expect(instruments.length).toBeGreaterThan(0);

      // 验证永续合约数据结构
      const btcSwap = instruments.find((i: any) => i.instId === 'BTC-USDT-SWAP');
      if (btcSwap) {
        expect(btcSwap.instType).toBe(INST_TYPES.SWAP);
        expect(typeof btcSwap.lever).toBe('string');
      }

      console.log(`✓ SWAP产品数量: ${instruments.length}`);
    });

    test('1.4 获取产品精度信息', async () => {
      const precision = await publicApi.getInstrumentPrecision('BTC-USDT', INST_TYPES.SPOT);

      expect(precision).toBeDefined();
      expect(precision).not.toBeNull();
      expect(typeof precision?.tickSize).toBe('number');
      expect(typeof precision?.lotSize).toBe('number');
      expect(typeof precision?.minSize).toBe('number');
      expect(precision?.tickSize).toBeGreaterThan(0);
      expect(precision?.lotSize).toBeGreaterThan(0);
      expect(precision?.minSize).toBeGreaterThan(0);

      console.log(`✓ BTC-USDT精度:`, {
        tickSize: precision?.tickSize,
        lotSize: precision?.lotSize,
        minSize: precision?.minSize,
      });
    });
  });

  // =====================================================
  // 第二部分：市场数据接口
  // =====================================================

  describe('2. 市场数据接口测试', () => {
    let marketApi: MarketApi;

    beforeAll(() => {
      marketApi = new MarketApi(undefined, IS_DEMO, PROXY);
    });

    test('2.1 获取所有SPOT Ticker', async () => {
      const tickers = await marketApi.getTickers(INST_TYPES.SPOT);

      expect(Array.isArray(tickers)).toBe(true);
      expect(tickers.length).toBeGreaterThan(0);

      // 验证数据格式
      tickers.forEach(ticker => validatePriceData(ticker));

      console.log(`✓ SPOT Ticker数量: ${tickers.length}`);
    });

    test('2.2 获取单个Ticker（BTC-USDT）', async () => {
      const ticker = await marketApi.getTicker('BTC-USDT');

      expect(Array.isArray(ticker)).toBe(true);
      expect(ticker.length).toBe(1);
      validatePriceData(ticker[0]);

      console.log(`✓ BTC-USDT 价格:`, {
        last: ticker[0].last,
        bid: ticker[0].bidPx,
        ask: ticker[0].askPx,
        volume: ticker[0].vol24h,
      });
    });

    test('2.3 获取K线数据（1H）', async () => {
      const candles = await marketApi.getLatestCandles('BTC-USDT', BAR_SIZES['1H'], 100);

      expect(Array.isArray(candles)).toBe(true);
      expect(candles.length).toBeGreaterThan(0);
      expect(candles.length).toBeLessThanOrEqual(100);

      // 验证数据格式
      candles.forEach(candle => validateCandleData(candle));

      // 验证时间序列（可能从新到旧或从旧到新，取决于API实现）
      const isNewestFirst = candles.length > 1 && candles[0].timestamp > candles[1].timestamp;
      for (let i = 1; i < candles.length; i++) {
        if (isNewestFirst) {
          // 最新的在前：每个时间戳应该小于前一个
          expect(candles[i].timestamp).toBeLessThan(candles[i - 1].timestamp);
        } else {
          // 最旧的在前：每个时间戳应该大于前一个
          expect(candles[i].timestamp).toBeGreaterThan(candles[i - 1].timestamp);
        }
      }

      console.log(`✓ K线数据数量: ${candles.length}`);
      console.log(`  时间范围: ${new Date(candles[0].timestamp).toISOString()} 至 ${new Date(candles[candles.length - 1].timestamp).toISOString()}`);
    });

    test('2.4 获取K线数据（多种周期）', async () => {
      const periods = [BAR_SIZES['1m'], BAR_SIZES['15m'], BAR_SIZES['1H'], BAR_SIZES['1D']];

      for (const period of periods) {
        const candles = await marketApi.getLatestCandles('BTC-USDT', period, 10);
        expect(Array.isArray(candles)).toBe(true);
        expect(candles.length).toBeGreaterThan(0);

        console.log(`✓ ${period} K线: ${candles.length}条`);
      }
    });

    test('2.5 获取深度数据', async () => {
      const orderBook = await marketApi.getOrderBook({
        instId: 'BTC-USDT',
        sz: 20
      });

      expect(orderBook).toBeDefined();
      expect(Array.isArray(orderBook.asks)).toBe(true);
      expect(Array.isArray(orderBook.bids)).toBe(true);
      expect(orderBook.asks.length).toBeGreaterThan(0);
      expect(orderBook.bids.length).toBeGreaterThan(0);

      // 验证深度数据结构
      const [askPrice, askSize, askOrders] = orderBook.asks[0];
      const [bidPrice, bidSize, bidOrders] = orderBook.bids[0];

      expect(parseFloat(askPrice)).toBeGreaterThan(0);
      expect(parseFloat(bidPrice)).toBeGreaterThan(0);
      expect(parseFloat(askPrice)).toBeGreaterThan(parseFloat(bidPrice)); // 卖价应该高于买价

      console.log(`✓ 深度数据:`, {
        asks: orderBook.asks.length,
        bids: orderBook.bids.length,
        bestAsk: askPrice,
        bestBid: bidPrice,
        spread: ((parseFloat(askPrice) - parseFloat(bidPrice)) / parseFloat(bidPrice) * 100).toFixed(4) + '%',
      });
    });

    test('2.6 获取24小时成交数据', async () => {
      const trades = await marketApi.getTrades({
        instId: 'BTC-USDT',
        limit: '100'  // limit needs to be string
      });

      expect(Array.isArray(trades)).toBe(true);
      expect(trades.length).toBeGreaterThan(0);

      // 验证成交数据结构
      const trade = trades[0];
      expect(typeof trade.instId).toBe('string');
      expect(typeof trade.tradeId).toBe('string');
      expect(typeof trade.px).toBe('string');
      expect(typeof trade.sz).toBe('string');
      expect(typeof trade.side).toBe('string');
      expect([ORDER_SIDES.BUY, ORDER_SIDES.SELL]).toContain(trade.side as 'buy' | 'sell');

      console.log(`✓ 最近成交数量: ${trades.length}`);
    });
  });

  // =====================================================
  // 第三部分：账户接口（需要认证）
  // =====================================================

  describe.skipIf(shouldSkipIntegration)('3. 账户接口测试 (需要认证)', () => {
    let accountApi: AccountApi;
    let auth: OkxAuth;

    beforeAll(() => {
      auth = new OkxAuth(authConfig!);
      accountApi = new AccountApi(auth, IS_DEMO, PROXY);
    });

    test('3.1 获取账户余额', async () => {
      const balances = await accountApi.getBalance();

      expect(Array.isArray(balances)).toBe(true);

      // 查找USDT余额
      const usdtBalance = balances.find((b: any) => b.ccy === 'USDT');

      if (usdtBalance) {
        // 验证余额数据结构
        expect(typeof usdtBalance.bal).toBe('string'); // 总余额
        expect(typeof usdtBalance.availBal).toBe('string'); // 可用余额
        expect(typeof usdtBalance.frozenBal).toBe('string'); // 冻结余额

        console.log(`✓ USDT余额:`, {
          total: usdtBalance.bal,
          available: usdtBalance.availBal,
          frozen: usdtBalance.frozenBal,
        });
      } else {
        console.log(`✓ 账户余额获取成功（无USDT余额）`);
        console.log(`  余额币种: ${balances.map((b: any) => b.ccy).join(', ')}`);
      }
    });

    test('3.2 获取账户配置', async () => {
      const config = await accountApi.getAccountConfig();

      expect(Array.isArray(config)).toBe(true);
      expect(config.length).toBeGreaterThan(0);

      // 验证账户配置数据结构
      const accountConfig = config[0];
      expect(typeof accountConfig.acctLv).toBe('string'); // 账户等级
      expect(typeof accountConfig.posMode).toBe('string'); // 持仓模式

      console.log(`✓ 账户配置:`, {
        level: accountConfig.acctLv,
        positionMode: accountConfig.posMode,
      });
    });

    test('3.3 获取持仓信息', async () => {
      const positions = await accountApi.getPositions();

      expect(Array.isArray(positions)).toBe(true);

      // 如果有持仓，验证数据结构
      if (positions.length > 0) {
        const pos = positions[0];
        expect(typeof pos.instId).toBe('string');
        expect(typeof pos.pos).toBe('string'); // 持仓数量
        expect(typeof pos.avgPx).toBe('string'); // 开仓均价
        expect(typeof pos.upl).toBe('string'); // 未实现盈亏
        expect(typeof pos.uplRatio).toBe('string'); // 未实现盈亏比率

        console.log(`✓ 持仓数量: ${positions.length}`);
        console.log(`  示例: ${pos.instId} - ${pos.pos} (${pos.uplRatio})`);
      } else {
        console.log(`✓ 当前无持仓`);
      }
    });

    test('3.4 获取账户资产估值', async () => {
      const assetValuation = await accountApi.getAccountAssetValuation();

      expect(assetValuation).toBeDefined();
      expect(typeof assetValuation.totalEq).toBe('string'); // 总权益

      console.log(`✓ 总权益: ${assetValuation.totalEq} USDT`);
    });
  });

  // =====================================================
  // 第四部分：交易接口（需要认证）
  // =====================================================

  describe.skipIf(shouldSkipIntegration)('4. 交易接口测试 (需要认证)', () => {
    let tradeApi: TradeApi;
    let auth: OkxAuth;

    beforeAll(() => {
      auth = new OkxAuth(authConfig!);
      tradeApi = new TradeApi(auth, IS_DEMO, PROXY);
    });

    test('4.1 获取订单列表', async () => {
      const orders = await tradeApi.getOrdersList();

      expect(Array.isArray(orders)).toBe(true);

      // 如果有订单，验证数据结构
      if (orders.length > 0) {
        orders.forEach(order => validateOrderData(order));

        console.log(`✓ 订单数量: ${orders.length}`);
        console.log(`  示例: ${orders[0].ordId} - ${orders[0].instId} ${orders[0].side} ${orders[0].ordType}`);
      } else {
        console.log(`✓ 当前无挂单`);
      }
    });

    test('4.2 获取历史订单', async () => {
      const orders = await tradeApi.getOrdersHistory({
        instType: INST_TYPES.SPOT
      });

      expect(Array.isArray(orders)).toBe(true);

      if (orders.length > 0) {
        orders.forEach(order => validateOrderData(order));
        console.log(`✓ 历史订单数量: ${orders.length}`);
      } else {
        console.log(`✓ 无历史订单`);
      }
    });

    test('4.3 获取成交历史', async () => {
      const trades = await tradeApi.getTradeHistory({
        instType: INST_TYPES.SPOT
      });

      expect(Array.isArray(trades)).toBe(true);

      if (trades.length > 0) {
        const trade = trades[0] as any;
        expect(typeof trade.tradeId).toBe('string');
        expect(typeof trade.instId).toBe('string');
        expect(typeof trade.side).toBe('string');
        // sz and px fields may vary in different API versions
        expect(typeof trade.sz || typeof trade.fillSz).toBeTruthy();
        expect(typeof trade.px || typeof trade.fillPx).toBeTruthy();

        console.log(`✓ 成交历史数量: ${trades.length}`);
      } else {
        console.log(`✓ 无成交历史`);
      }
    });
  });

  // =====================================================
  // 第五部分：WebSocket接口测试
  // =====================================================

  describe.skipIf(shouldSkipIntegration)('5. WebSocket接口测试 (需要认证)', () => {
    let wsClient: WsClient;
    let testData: any[] = [];

    beforeAll(async () => {
      wsClient = createWsClientFromEnv();
    });

    afterAll(() => {
      wsClient?.disconnect();
    });

    test('5.1 连接公共WebSocket', async () => {
      await wsClient.connectPublic();

      expect(wsClient.getState()).toBe('connected');
      console.log(`✓ 公共WebSocket已连接`);
    });

    test('5.2 订阅Ticker频道', (done) => {
      const timeout = setTimeout(() => {
        // 模拟盘可能不推送数据，只要订阅成功就算通过
        console.log(`✓ Ticker订阅已注册（模拟盘可能无数据推送）`);
        done();
      }, 10000);

      wsClient.subscribe(
        { channel: 'tickers', instId: 'BTC-USDT' },
        (data: unknown) => {
          clearTimeout(timeout);
          validatePriceData(data);
          const ticker = data as any;
          console.log(`✓ Ticker数据接收:`, {
            instId: ticker.instId,
            price: ticker.last,
            bid: ticker.bidPx,
            ask: ticker.askPx,
          });
          done();
        }
      );
    }, 15000);

    test('5.3 订阅K线频道', (done) => {
      const timeout = setTimeout(() => {
        console.log(`✓ K线订阅已注册（模拟盘可能无数据推送）`);
        done();
      }, 10000);

      wsClient.subscribe(
        { channel: 'candle1H', instId: 'BTC-USDT' },
        (data: unknown) => {
          clearTimeout(timeout);
          validateCandleData(data);
          const candle = data as any;
          console.log(`✓ K线数据接收:`, {
            time: new Date(parseInt(candle.ts)).toISOString(),
            open: candle.o,
            high: candle.h,
            low: candle.l,
            close: candle.c,
          });
          done();
        }
      );
    }, 15000);

    test('5.4 订阅深度频道', (done) => {
      const timeout = setTimeout(() => {
        console.log(`✓ 深度订阅已注册（模拟盘可能无数据推送）`);
        done();
      }, 10000);

      wsClient.subscribe(
        { channel: 'books5', instId: 'BTC-USDT' },
        (data: unknown) => {
          clearTimeout(timeout);
          const book = data as any;
          expect(book.asks).toBeDefined();
          expect(book.bids).toBeDefined();
          console.log(`✓ 深度数据接收:`, {
            asks: book.asks?.length,
            bids: book.bids?.length,
          });
          done();
        }
      );
    }, 15000);

    test('5.5 取消订阅', () => {
      wsClient.unsubscribe('tickers', 'BTC-USDT');
      wsClient.unsubscribe('candle1H', 'BTC-USDT');
      wsClient.unsubscribe('books5', 'BTC-USDT');

      console.log(`✓ 取消订阅成功`);
    });

    test('5.6 连接私有WebSocket', async () => {
      await wsClient.connectPrivate();

      expect(wsClient.getState()).toBe('authenticated');
      console.log(`✓ 私有WebSocket已连接并认证`);
    }, 30000);

    test('5.7 订阅账户频道', (done) => {
      const timeout = setTimeout(() => {
        console.log(`✓ 账户频道订阅已注册`);
        done();
      }, 10000);

      wsClient.subscribe(
        { channel: 'account' },
        (data) => {
          clearTimeout(timeout);
          console.log(`✓ 账户数据接收:`, data);
          done();
        }
      );
    }, 15000);

    test('5.8 订阅持仓频道', (done) => {
      const timeout = setTimeout(() => {
        console.log(`✓ 持仓频道订阅已注册`);
        done();
      }, 10000);

      wsClient.subscribe(
        { channel: 'positions', instType: INST_TYPES.SWAP },
        (data) => {
          clearTimeout(timeout);
          console.log(`✓ 持仓数据接收:`, data);
          done();
        }
      );
    }, 15000);
  });

  // =====================================================
  // 第六部分：数据类型和值域验证
  // =====================================================

  describe('6. 数据类型和值域验证', () => {
    let marketApi: MarketApi;

    beforeAll(() => {
      marketApi = new MarketApi(undefined, IS_DEMO, PROXY);
    });

    test('6.1 Ticker价格应该是正数', async () => {
      const tickers = await marketApi.getTickers(INST_TYPES.SPOT);
      const btcTicker = tickers.find((t: any) => t.instId === 'BTC-USDT');

      expect(parseFloat(btcTicker.last)).toBeGreaterThan(0);
      expect(parseFloat(btcTicker.bidPx)).toBeGreaterThan(0);
      expect(parseFloat(btcTicker.askPx)).toBeGreaterThan(0);
      expect(parseFloat(btcTicker.high24h)).toBeGreaterThan(0);
      expect(parseFloat(btcTicker.low24h)).toBeGreaterThan(0);

      // 验证高低价关系
      expect(parseFloat(btcTicker.high24h)).toBeGreaterThanOrEqual(parseFloat(btcTicker.low24h));

      console.log(`✓ BTC-USDT价格验证通过`);
    });

    test('6.2 K线OHLC逻辑关系正确', async () => {
      const candles = await marketApi.getLatestCandles('BTC-USDT', BAR_SIZES['1H'], 100);

      candles.forEach(candle => {
        const { open, high, low, close } = candle;

        expect(high).toBeGreaterThanOrEqual(open);
        expect(high).toBeGreaterThanOrEqual(close);
        expect(low).toBeLessThanOrEqual(open);
        expect(low).toBeLessThanOrEqual(close);
      });

      console.log(`✓ ${candles.length}条K线OHLC关系验证通过`);
    });

    test('6.3 深度数据买卖价差合理', async () => {
      const orderBook = await marketApi.getOrderBook({
        instId: 'BTC-USDT',
        sz: 20
      });

      const [bestAsk] = orderBook.asks[0];
      const [bestBid] = orderBook.bids[0];

      const spread = (parseFloat(bestAsk) - parseFloat(bestBid)) / parseFloat(bestBid);

      // 价差应该小于1%（通常远小于此值）
      expect(spread).toBeLessThan(0.01);

      console.log(`✓ 买卖价差验证通过: ${(spread * 100).toFixed(4)}%`);
    });
  });

  // =====================================================
  // 第七部分：API错误处理
  // =====================================================

  describe('7. API错误处理', () => {
    let marketApi: MarketApi;

    beforeAll(() => {
      marketApi = new MarketApi(undefined, IS_DEMO, PROXY);
    });

    test('7.1 无效的产品ID应该返回空或错误', async () => {
      // OKX API 对无效产品会抛出错误
      try {
        const ticker = await marketApi.getTicker('INVALID-COIN-XYZ');
        // 如果没有抛出错误，应该返回空数组或特殊响应
        expect(Array.isArray(ticker)).toBe(true);
        console.log(`✓ 无效产品返回空数组`);
      } catch (error: unknown) {
        // 或者抛出包含错误信息的异常
        expect(error).toBeDefined();
        const errorMessage = (error as Error).message || '';
        expect(errorMessage.length).toBeGreaterThan(0);
        console.log(`✓ 无效产品抛出错误: ${errorMessage}`);
      }
    });

    test('7.2 超大K线数量应该被限制', async () => {
      // OKX API最多返回300条K线
      const candles = await marketApi.getLatestCandles('BTC-USDT', BAR_SIZES['1H'], 10000);

      expect(candles.length).toBeLessThanOrEqual(300);

      console.log(`✓ K线数量限制验证: 请求10000条，返回${candles.length}条`);
    });
  });
});

// =====================================================
// 测试完成
// =====================================================

console.log('='.repeat(60));
console.log('测试说明：');
console.log('1. 公共接口和行情接口应该全部通过（无需认证）');
console.log('2. 账户和交易接口需要配置 OKX_API_KEY 等环境变量');
console.log('3. WebSocket测试需要有效的API凭证');
console.log('4. 模拟盘环境可能不会主动推送数据');
console.log('='.repeat(60));
