/**
 * DCA + 网格策略演示脚本
 *
 * 这是一个简化的演示版本，用于测试策略框架的基本功能
 * 不需要真实的 API 密钥
 */

import { DEFAULT_CONFIG } from './config/default-params.js';
import { DCAEngine } from './core/dca-engine.js';
import { GridEngine } from './core/grid-engine.js';
import { VolatilityCalculator } from './multi-coin/volatility-calculator.js';
import { RangeCalculator } from './dynamic-range/range-calculator.js';
import type { Candle, MarketData, CoinPosition, AllowedCoin } from './config/types.js';

// =====================================================
// 模拟数据生成器
// =====================================================

class MockDataGenerator {
  private basePrice: number;
  private volatility: number;

  constructor(basePrice: number, volatility: number = 0.02) {
    this.basePrice = basePrice;
    this.volatility = volatility;
  }

  /**
   * 生成模拟价格（随机游走）
   */
  getNextPrice(previousPrice?: number): number {
    const current = previousPrice || this.basePrice;
    const change = (Math.random() - 0.5) * 2 * this.volatility * current;
    return current + change;
  }

  /**
   * 生成模拟 K 线数据
   */
  generateCandles(count: number, intervalMs: number = 60000): Candle[] {
    const candles: Candle[] = [];
    let price = this.basePrice;
    let now = Date.now() - count * intervalMs;

    for (let i = 0; i < count; i++) {
      const open = price;
      const high = price * (1 + Math.random() * this.volatility);
      const low = price * (1 - Math.random() * this.volatility);
      price = this.getNextPrice(price);
      const close = price;

      candles.push({
        timestamp: now + i * intervalMs,
        open,
        high,
        low,
        close,
        volume: Math.random() * 1000
      });
    }

    return candles;
  }

  /**
   * 生成模拟市场数据
   */
  generateMarketData(coin: AllowedCoin): MarketData {
    const price = this.getNextPrice();
    return {
      symbol: `${coin}-USDT`,
      coin,
      price,
      bidPrice: price * 0.9999,
      askPrice: price * 1.0001,
      volume24h: Math.random() * 10000000,
      change24h: (Math.random() - 0.5) * 10,
      changePercent24h: (Math.random() - 0.5) * 10,
      high24h: price * 1.05,
      low24h: price * 0.95,
      timestamp: Date.now()
    };
  }

  /**
   * 生成模拟持仓数据
   */
  generatePosition(coin: AllowedCoin, amount: number = 0.1): CoinPosition {
    const avgPrice = this.basePrice * (0.9 + Math.random() * 0.2);
    const currentPrice = this.getNextPrice(avgPrice);
    const value = amount * currentPrice;
    const cost = amount * avgPrice; // 成本基于平均价格

    return {
      coin,
      symbol: `${coin}-USDT`,
      amount,
      avgPrice,
      currentPrice,
      value,
      cost,
      unrealizedPnL: (currentPrice - avgPrice) * amount,
      unrealizedPnLPercent: ((currentPrice - avgPrice) / avgPrice) * 100,
      lastUpdate: Date.now()
    };
  }
}

// =====================================================
// 演示程序
// =====================================================

async function runDemo() {
  console.log('========================================');
  console.log('DCA + 网格策略演示');
  console.log('========================================');
  console.log('');

  // 创建模拟数据生成器
  const btcGenerator = new MockDataGenerator(50000, 0.02); // BTC: $50,000, 2% 波动
  const ethGenerator = new MockDataGenerator(3000, 0.025);  // ETH: $3,000, 2.5% 波动

  // 创建策略组件
  const dcaEngine = new DCAEngine(DEFAULT_CONFIG.dca);
  const volatilityCalculator = new VolatilityCalculator();
  const rangeCalculator = new RangeCalculator(undefined, volatilityCalculator);

  console.log('1. 初始化币种状态...');
  const btc = 'BTC' as AllowedCoin;
  const eth = 'ETH' as AllowedCoin;

  // 生成初始持仓
  const btcPosition = btcGenerator.generatePosition(btc, 0.1);
  const ethPosition = ethGenerator.generatePosition(eth, 2);

  dcaEngine.initializeCoin(btc, btcPosition);
  dcaEngine.initializeCoin(eth, ethPosition);

  console.log(`   BTC: ${btcPosition.amount.toFixed(6)} @ $${btcPosition.avgPrice.toFixed(2)}`);
  console.log(`   ETH: ${ethPosition.amount.toFixed(6)} @ $${ethPosition.avgPrice.toFixed(2)}`);
  console.log('');

  console.log('2. 计算波动率...');
  const btcCandles = btcGenerator.generateCandles(100);
  const ethCandles = ethGenerator.generateCandles(100);

  const btcVolatility = await volatilityCalculator.calculateVolatility(btc, btcCandles);
  const ethVolatility = await volatilityCalculator.calculateVolatility(eth, ethCandles);

  console.log(`   BTC 波动率: ${btcVolatility.current.average.toFixed(2)}% (${btcVolatility.classification})`);
  console.log(`   ETH 波动率: ${ethVolatility.current.average.toFixed(2)}% (${ethVolatility.classification})`);
  console.log('');

  console.log('3. 计算价格区间...');
  const btcRange = await rangeCalculator.calculateRange(btc, btcCandles, btcGenerator.getNextPrice());
  const ethRange = await rangeCalculator.calculateRange(eth, ethCandles, ethGenerator.getNextPrice());

  console.log(`   BTC 区间: $${btcRange.recommendedRange.lower.toFixed(2)} - $${btcRange.recommendedRange.upper.toFixed(2)} (${btcRange.recommendedRange.width.toFixed(2)}%)`);
  console.log(`   ETH 区间: $${ethRange.recommendedRange.lower.toFixed(2)} - $${ethRange.recommendedRange.upper.toFixed(2)} (${ethRange.recommendedRange.width.toFixed(2)}%)`);
  console.log('');

  console.log('4. 运行策略模拟 (20 个周期)...');
  console.log('----------------------------------------');

  for (let i = 1; i <= 20; i++) {
    // 生成新的市场数据
    const btcMarket = btcGenerator.generateMarketData(btc);
    const ethMarket = ethGenerator.generateMarketData(eth);

    // 更新持仓状态
    dcaEngine.updateCoinState(btc, {
      ...btcPosition,
      currentPrice: btcMarket.price,
      unrealizedPnL: (btcMarket.price - btcPosition.avgPrice) * btcPosition.amount,
      unrealizedPnLPercent: ((btcMarket.price - btcPosition.avgPrice) / btcPosition.avgPrice) * 100
    });

    dcaEngine.updateCoinState(eth, {
      ...ethPosition,
      currentPrice: ethMarket.price,
      unrealizedPnL: (ethMarket.price - ethPosition.avgPrice) * ethPosition.amount,
      unrealizedPnLPercent: ((ethMarket.price - ethPosition.avgPrice) / ethPosition.avgPrice) * 100
    });

    // 检查 DCA 决策
    const btcDCA = await dcaEngine.checkDCA(btc, btcMarket);
    const ethDCA = await dcaEngine.checkDCA(eth, ethMarket);

    if (btcDCA) {
      console.log(`周期 ${i}: BTC DCA 触发 - ${btcDCA.type} @ $${btcDCA.price.toFixed(2)}, 大小: $${btcDCA.size.toFixed(2)}`);
      // 执行 DCA 订单
      await dcaEngine.executeDCA(btc, btcDCA);
    }
    if (ethDCA) {
      console.log(`周期 ${i}: ETH DCA 触发 - ${ethDCA.type} @ $${ethDCA.price.toFixed(2)}, 大小: $${ethDCA.size.toFixed(2)}`);
      // 执行 DCA 订单
      await dcaEngine.executeDCA(eth, ethDCA);
    }

    // 每 5 个周期打印一次状态
    if (i % 5 === 0 || btcDCA || ethDCA) {
      const btcState = dcaEngine.getCoinState(btc);
      const ethState = dcaEngine.getCoinState(eth);
      // 计算当前 PnL
      const btcPnL = ((btcMarket.price - btcPosition.avgPrice) / btcPosition.avgPrice) * 100;
      const ethPnL = ((ethMarket.price - ethPosition.avgPrice) / ethPosition.avgPrice) * 100;
      console.log(`  状态: BTC $${btcMarket.price.toFixed(2)} (${btcPnL.toFixed(2)}%), ETH $${ethMarket.price.toFixed(2)} (${ethPnL.toFixed(2)}%)`);
    }

    // 模拟时间延迟
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('----------------------------------------');
  console.log('');

  console.log('5. 最终状态报告...');
  const btcState = dcaEngine.getCoinState(btc);
  const ethState = dcaEngine.getCoinState(eth);

  if (btcState) {
    console.log(`BTC DCA 状态: ${btcState.totalOrders} 单, ${btcState.totalInvested.toFixed(2)} USDT, 平均价 $${btcState.avgEntryPrice.toFixed(2)}`);
  } else {
    console.log('BTC DCA 状态: 未初始化');
  }

  if (ethState) {
    console.log(`ETH DCA 状态: ${ethState.totalOrders} 单, ${ethState.totalInvested.toFixed(2)} USDT, 平均价 $${ethState.avgEntryPrice.toFixed(2)}`);
  } else {
    console.log('ETH DCA 状态: 未初始化');
  }

  console.log('');
  console.log('6. 波动率报告...');
  console.log(`BTC 波动率: ${btcVolatility.current.average.toFixed(2)}% (${btcVolatility.classification})`);
  console.log(`ETH 波动率: ${ethVolatility.current.average.toFixed(2)}% (${ethVolatility.classification})`);

  console.log('');
  console.log('7. 价格区间报告...');
  console.log(`BTC 区间: $${btcRange.recommendedRange.lower.toFixed(2)} - $${btcRange.recommendedRange.upper.toFixed(2)} (${btcRange.recommendedRange.width.toFixed(2)}%)`);
  console.log(`ETH 区间: $${ethRange.recommendedRange.lower.toFixed(2)} - $${ethRange.recommendedRange.upper.toFixed(2)} (${ethRange.recommendedRange.width.toFixed(2)}%)`);

  console.log('');

  console.log('========================================');
  console.log('演示完成！');
  console.log('========================================');
}

// 运行演示
if (import.meta.main) {
  runDemo().catch(console.error);
}

export { runDemo };
