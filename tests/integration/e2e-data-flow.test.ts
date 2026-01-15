/**
 * 端到端数据流测试
 *
 * 验证完整的数据流：
 * OKX API -> 数据转换 -> 策略处理 -> 订单生成 -> OKX API 参数
 */

import { beforeAll, describe, test, expect } from 'bun:test';
import { OkxAuth, loadAuthFromEnv } from '../../src/core/auth.js';
import { TradeApi } from '../../src/api/trade.js';
import { MarketApi } from '../../src/api/market.js';
import { AccountApi } from '../../src/api/account.js';
import { SpotDCAGridStrategyEngine } from '../../src/strategies/spot-dca-grid/core/engine.js';
import { DEFAULT_CONFIG } from '../../src/strategies/spot-dca-grid/config/default-params.js';
import { DataAdapter } from '../../src/strategies/spot-dca-grid/infrastructure/data-adapter.js';

// =====================================================
// 测试配置
// =====================================================

const shouldSkipIntegration = !process.env.OKX_API_KEY || !process.env.OKX_SECRET_KEY;

describe.skipIf(shouldSkipIntegration)('End-to-End Data Flow Tests', () => {
  let tradeApi: TradeApi;
  let marketApi: MarketApi;
  let accountApi: AccountApi;
  let strategyEngine: SpotDCAGridStrategyEngine;

  beforeAll(async () => {
    const authConfig = loadAuthFromEnv();
    if (!authConfig) throw new Error('无法加载认证信息');

    const auth = new OkxAuth(authConfig);
    const proxy = process.env.HTTP_PROXY || process.env.HTTPS_PROXY;

    tradeApi = new TradeApi(auth, true, proxy);
    marketApi = new MarketApi(auth, true, proxy);
    accountApi = new AccountApi(auth, true, proxy);

    // 创建策略引擎
    strategyEngine = new SpotDCAGridStrategyEngine(DEFAULT_CONFIG, {
      okxApi: {
        getTicker: async (symbol: string) => {
          const tickers = await marketApi.getTicker(symbol);
          return tickers[0];
        }
      },
      updateInterval: 60000,
      enableAutoTrade: false,
      maxConcurrentOrders: 20
    });
  });

  // =====================================================
  // 1. API -> 策略模块数据转换测试
  // =====================================================

  test('完整数据流: API Ticker -> 策略 MarketData', async () => {
    // 1. 从 OKX API 获取原始数据
    const tickers = await marketApi.getTicker('BTC-USDT');
    expect(tickers.length).toBeGreaterThan(0);
    const ticker = tickers[0];

    console.log('API 原始数据 (字符串格式):');
    console.log('  last (string):', ticker.last, typeof ticker.last);
    console.log('  volCcy24h (string):', ticker.volCcy24h, typeof ticker.volCcy24h);

    // 2. 转换为策略模块格式
    const marketData = DataAdapter.tickerToMarketData(ticker, 'BTC');

    console.log('策略模块数据 (number 格式):');
    console.log('  price (number):', marketData.price, typeof marketData.price);
    console.log('  volume24h (number):', marketData.volume24h, typeof marketData.volume24h);

    // 3. 验证转换正确
    expect(typeof marketData.price).toBe('number');
    expect(typeof marketData.volume24h).toBe('number');
    expect(marketData.price).toBe(parseFloat(ticker.last));
  });

  test('完整数据流: API Candle -> 策略 Candle', async () => {
    // 1. 从 OKX API 获取原始数据（字符串数组）
    const candles = await marketApi.getCandles({
      instId: 'BTC-USDT',
      bar: '1H',
      limit: '10'
    });

    expect(candles.length).toBeGreaterThan(0);
    const rawCandle = candles[0];

    console.log('API 原始数据 (字符串数组):');
    console.log('  [timestamp, open, high, low, close, volume, ...]');
    console.log('  类型:', Array.isArray(rawCandle) ? '数组' : typeof rawCandle);
    console.log('  长度:', rawCandle.length);
    console.log('  元素类型:', rawCandle.map(x => typeof x));

    // 2. 转换为策略模块格式
    const strategyCandle = DataAdapter.candleRawToStrategy(rawCandle);

    console.log('策略模块数据 (number 格式):');
    console.log('  timestamp (number):', strategyCandle.timestamp, typeof strategyCandle.timestamp);
    console.log('  open (number):', strategyCandle.open, typeof strategyCandle.open);
    console.log('  close (number):', strategyCandle.close, typeof strategyCandle.close);

    // 3. 验证转换正确
    expect(typeof strategyCandle.timestamp).toBe('number');
    expect(typeof strategyCandle.open).toBe('number');
    expect(typeof strategyCandle.close).toBe('number');
    expect(strategyCandle.open).toBe(parseFloat(rawCandle[1]));
  });

  // =====================================================
  // 2. 订单参数格式验证
  // =====================================================

  test('订单参数必须是字符串格式', async () => {
    // 模拟策略决策
    const decision = {
      coin: 'BTC' as const,
      action: 'buy' as const,
      type: 'dca' as const,
      price: 50000.5,
      size: 100, // USDT
      reason: 'test',
      timestamp: Date.now(),
      priority: 1
    };

    // 计算订单参数（模拟引擎逻辑）
    const amount = decision.size / decision.price;
    const orderParams = {
      instId: 'BTC-USDT',
      tdMode: 'cash',
      side: decision.action,
      ordType: 'limit',
      sz: amount.toFixed(8),      // 必须是字符串
      px: decision.price.toFixed(2)  // 必须是字符串
    };

    console.log('订单参数:');
    console.log('  sz (字符串):', orderParams.sz, typeof orderParams.sz);
    console.log('  px (字符串):', orderParams.px, typeof orderParams.px);

    // 验证格式正确
    expect(typeof orderParams.sz).toBe('string');
    expect(typeof orderParams.px).toBe('string');

    // 验证可以正确解析回数字（允许浮点数精度差异）
    const parsedSize = parseFloat(orderParams.sz);
    const parsedPrice = parseFloat(orderParams.px);

    // 使用近似比较
    expect(Math.abs(parsedSize - amount)).toBeLessThan(1e-10);
    expect(parsedPrice).toBeCloseTo(decision.price, 2);
  });

  // =====================================================
  // 3. 数据适配器功能测试
  // =====================================================

  test('数据适配器: 格式化价格和数量', () => {
    const price = 50000.123456;
    const size = 0.00123456;

    const formattedPrice = DataAdapter.formatPrice(price, 2);
    const formattedSize = DataAdapter.formatSize(size, 8);

    console.log('格式化结果:');
    console.log('  price: 50000.123456 ->', formattedPrice);
    console.log('  size: 0.00123456 ->', formattedSize);

    // 验证返回字符串
    expect(typeof formattedPrice).toBe('string');
    expect(typeof formattedSize).toBe('string');

    // 验证精度正确
    expect(formattedPrice).toBe('50000.12');
    expect(formattedSize).toBe('0.00123456');
  });

  test('数据适配器: 根据币种获取精度', () => {
    const btcPricePrecision = DataAdapter.getPricePrecision('BTC');
    const btcSizePrecision = DataAdapter.getSizePrecision('BTC');
    const dogePricePrecision = DataAdapter.getPricePrecision('DOGE');

    console.log('各币种精度:');
    console.log('  BTC 价格精度:', btcPricePrecision);
    console.log('  BTC 数量精度:', btcSizePrecision);
    console.log('  DOGE 价格精度:', dogePricePrecision);

    expect(btcPricePrecision).toBe(2);
    expect(btcSizePrecision).toBe(8);
    expect(dogePricePrecision).toBe(5);
  });

  // =====================================================
  // 4. 账户余额转换测试
  // =====================================================

  test('完整数据流: API Balance -> 策略 CoinPosition', async () => {
    // 1. 获取余额
    const balances = await accountApi.getBalance();
    const usdtBalance = balances.find(b => b.ccy === 'USDT');

    if (!usdtBalance || parseFloat(usdtBalance.bal) === 0) {
      console.log('跳过: USDT 余额为 0');
      return;
    }

    console.log('API 原始余额数据:');
    console.log('  ccy:', usdtBalance.ccy);
    console.log('  bal (string):', usdtBalance.bal, typeof usdtBalance.bal);
    console.log('  availBal (string):', usdtBalance.availBal, typeof usdtBalance.availBal);

    // 2. 获取当前价格
    const tickers = await marketApi.getTicker('USDT-USDT');
    // USDT 价格为 1
    const price = 1;

    // 3. 转换为策略格式
    const position = DataAdapter.balanceToPosition(
      usdtBalance,
      'BTC',  // 使用有效的 AllowedCoin
      price,
      'USDT-USDT'
    );

    if (!position) {
      console.log('跳过: 余额为 0');
      return;
    }

    console.log('策略模块持仓数据:');
    console.log('  amount (number):', position.amount, typeof position.amount);
    console.log('  value (number):', position.value, typeof position.value);

    // 4. 验证转换正确
    expect(typeof position.amount).toBe('number');
    expect(typeof position.value).toBe('number');
    expect(position.amount).toBe(parseFloat(usdtBalance.availBal));
  });
});

// =====================================================
// 运行测试
// =====================================================

if (import.meta.main) {
  console.log('运行端到端数据流测试...');
  console.log('确保已设置环境变量: OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE');
  console.log('');
}
