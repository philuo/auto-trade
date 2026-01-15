/**
 * OKX 量化交易系统 - 示例运行脚本
 *
 * 演示如何使用完整的策略系统
 */

import { StrategyManager } from '../manager/strategy-manager';
import { TrendAnalyzer } from '../common/trend-analyzer';
import { RiskManager } from '../common/risk-manager';

// 现货策略配置
import { DEFAULT_CONFIG as SPOT_DEFAULT_CONFIG } from '../spot-dca-grid/config/default-params';

// 合约策略配置
import { DEFAULT_NEUTRAL_GRID_CONFIG } from '../neutral-grid/config/default-params';

// 模拟 OKX API 客户端
class MockOKXApi {
  async getTicker(symbol: string) {
    // 模拟返回数据
    return {
      last: '50000',
      bidPx: '49999',
      askPx: '50001',
      vol24h: '1000000',
      open24h: '49000',
      high24h: '51000',
      low24h: '48500'
    };
  }

  async getSwapTicker(instId: string) {
    return {
      last: '50000',
      bidPx: '49999',
      askPx: '50001',
      vol24h: '1000000',
      open24h: '49000',
      high24h: '51000',
      low24h: '48500',
      fundingRate: '0.0001',
      markPx: '50000',
      idxPx: '50000'
    };
  }

  async placeOrder(params: any) {
    console.log('[MockAPI] 下单:', params);
    return { ordId: 'mock-order-' + Date.now() };
  }

  async placeSwapOrder(params: any) {
    console.log('[MockAPI] 合约下单:', params);
    return { ordId: 'mock-swap-order-' + Date.now() };
  }
}

// =====================================================
// 主函数
// =====================================================

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║          OKX 量化交易系统 v1.0.0                              ║
║          Complete Quantitative Trading System                 ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
  `);

  // 1. 创建模拟 API 客户端
  const okxApi = new MockOKXApi();

  // 2. 配置策略管理器
  const spotCoins: ('BTC' | 'ETH' | 'BNB' | 'SOL' | 'XRP' | 'ADA' | 'DOGE')[] = ['BNB', 'SOL', 'XRP', 'ADA', 'DOGE'];
  const swapCoins: ('BTC' | 'ETH')[] = ['BTC', 'ETH'];

  const strategyManagerConfig = {
    capital: {
      totalCapital: 10000,         // 10,000 USDT
      spotPercentage: 50,          // 50% 现货
      swapPercentage: 50,          // 50% 合约
      reserve: 500                 // 500 USDT 应急储备
    },
    spot: {
      enabled: true,
      config: SPOT_DEFAULT_CONFIG,
      coins: spotCoins  // 现货币种
    },
    swap: {
      enabled: true,
      config: DEFAULT_NEUTRAL_GRID_CONFIG,
      coins: swapCoins               // 合约币种
    },
    risk: {
      maxTotalDrawdown: 20,
      autoPauseOnDrawdown: true,
      rebalanceInterval: 24
    }
  };

  // 3. 创建策略管理器
  const manager = new StrategyManager(strategyManagerConfig, okxApi);

  // 4. 创建风险管理器
  const riskManager = new RiskManager({
    maxDrawdown: 20,
    warningDrawdown: 10,
    emergencyDrawdown: 30,
    maxPositionSize: 0.3,
    stopLossPercent: 15
  });

  // 5. 创建趋势分析器
  const trendAnalyzer = new TrendAnalyzer();

  console.log('\n📊 策略配置摘要:\n');
  console.log('现货策略 (DCA-网格混合):');
  console.log('  - 币种: BNB, SOL, XRP, ADA, DOGE');
  console.log('  - 资金: 5,000 USDT');
  console.log('  - 策略: 定投 + 网格交易\n');
  console.log('合约策略 (中性网格):');
  console.log('  - 币种: BTC (5x杠杆), ETH (3x杠杆)');
  console.log('  - 资金: 5,000 USDT');
  console.log('  - 策略: 多空双向网格\n');

  console.log('💡 手续费优化:');
  console.log('  - 优先使用限价单 (Maker) 挂单');
  console.log('  - 合约 Maker 手续费: 0.02%');
  console.log('  - 合约 Taker 手续费: 0.05%');
  console.log('  - 现货 Maker 手续费: 0.08%');
  console.log('  - 现货 Taker 手续费: 0.10%\n');

  console.log('⚠️  风险控制:');
  console.log('  - 最大回撤: 20%');
  console.log('  - 单币种最大仓位: 30%');
  console.log('  - 自动止损: 15%');
  console.log('  - 杠杆限制: BTC 5x, ETH 3x\n');

  // 6. 启动策略
  console.log('🚀 启动策略...\n');

  try {
    await manager.start();

    console.log('\n✅ 策略已启动！');
    console.log('按 Ctrl+C 停止策略\n');

    // 定期生成报告
    setInterval(() => {
      console.log('\n' + '='.repeat(80));
      console.log('📈 策略运行报告');
      console.log('='.repeat(80) + manager.generateReport());

      // 风险检查
      const riskCheck = riskManager.assessOverallRisk(
        manager.getOverallState().totalEquity,
        [],
        strategyManagerConfig.capital.totalCapital
      );

      console.log('\n' + riskManager.generateRiskReport(riskCheck));
    }, 60000); // 每分钟生成一次报告

  } catch (error) {
    console.error('启动策略失败:', error);
    process.exit(1);
  }

  // 优雅退出
  process.on('SIGINT', async () => {
    console.log('\n\n⏹️  停止策略...\n');
    await manager.stop();
    console.log('✅ 策略已停止');
    console.log('\n最终报告:\n' + manager.generateReport());
    process.exit(0);
  });
}

// =====================================================
// 运行示例
// =====================================================

if (import.meta.main) {
  main().catch(console.error);
}
