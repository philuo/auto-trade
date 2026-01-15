/**
 * 日志系统使用示例
 *
 * 演示如何使用统一日志系统记录决策和交易
 */

import { logger, LogAnalyzer, LogLevel, LogType } from './index';

// =====================================================
// 示例 1: 基础日志记录
// =====================================================

function basicLoggingExample() {
  console.log('\n=== 基础日志记录示例 ===\n');

  // 不同级别的日志
  logger.debug('这是调试信息', { someData: 'value' });
  logger.info('这是普通信息', { status: 'running' });
  logger.warn('这是警告信息', { warning: 'high memory usage' });
  logger.error('这是错误信息', new Error('Something went wrong'));
  logger.critical('这是严重错误', { system: 'crashed' });
}

// =====================================================
// 示例 2: 决策日志记录
// =====================================================

function decisionLoggingExample() {
  console.log('\n=== 决策日志记录示例 ===\n');

  // DCA 决策
  logger.decision({
    coin: 'BTC',
    strategy: 'dca',
    action: 'buy',
    reason: 'price_drop_5.2%',
    marketData: {
      price: 45000,
      change24h: -5.2,
      volume24h: 1000000
    },
    decisionFactors: {
      dcaType: 'reverse',
      level: 2,
      multiplier: 2,
      orderSize: 100,
      avgEntryPrice: 47500,
      totalOrders: 5,
      totalInvested: 500
    }
  });

  // 网格决策
  logger.decision({
    coin: 'ETH',
    strategy: 'grid',
    action: 'sell',
    reason: 'grid_order_filled_sell',
    marketData: {
      price: 3200,
      change24h: 2.5,
      volume24h: 500000
    },
    decisionFactors: {
      gridPrice: 3200,
      gridType: 'sell',
      orderSize: 1,
      orderValue: 3200,
      totalBuyOrders: 10,
      totalSellOrders: 8,
      realizedProfit: 150
    }
  });

  // 风险决策
  logger.decision({
    coin: 'BTC',
    strategy: 'risk',
    action: 'hold',
    reason: '协同模式调整: dca_priority',
    marketData: {
      price: 45000,
      change24h: -5.2,
      volume24h: 1000000
    },
    decisionFactors: {
      pnl: -12.5,
      oldMode: 'normal',
      newMode: 'dca_priority',
      reason: '大幅亏损: -12.5%'
    }
  });
}

// =====================================================
// 示例 3: 交易日志记录
// =====================================================

function tradeLoggingExample() {
  console.log('\n=== 交易日志记录示例 ===\n');

  // 订单创建
  logger.trade({
    orderId: '12345678',
    clientOrderId: 'client-btc-buy-001',
    coin: 'BTC',
    side: 'buy',
    price: 45000,
    size: 0.001,
    value: 45,
    status: 'live',
    metadata: {
      strategy: 'dca',
      orderType: 'limit',
      symbol: 'BTC-USDT'
    }
  });

  // 订单成交
  logger.trade({
    orderId: '12345678',
    clientOrderId: 'client-btc-buy-001',
    coin: 'BTC',
    side: 'buy',
    price: 45000,
    size: 0.001,
    value: 45,
    fee: 0.045,
    status: 'filled',
    metadata: {
      strategy: 'dca',
      orderType: 'limit',
      symbol: 'BTC-USDT',
      filledAt: Date.now()
    }
  });

  // 订单取消
  logger.trade({
    orderId: '87654321',
    clientOrderId: 'client-eth-sell-002',
    coin: 'ETH',
    side: 'sell',
    price: 3200,
    size: 1,
    status: 'cancelled',
    metadata: {
      strategy: 'grid',
      orderType: 'limit',
      symbol: 'ETH-USDT',
      cancelledAt: Date.now()
    }
  });
}

// =====================================================
// 示例 4: 风险日志记录
// =====================================================

function riskLoggingExample() {
  console.log('\n=== 风险日志记录示例 ===\n');

  // 风险警告
  logger.risk(
    'BTC',
    'drawdown_warning',
    'warning',
    '回撤接近警告阈值',
    9.5,
    10,
    'monitoring',
    { currentDrawdown: 9.5, warningThreshold: 10 }
  );

  // 触发止损
  logger.risk(
    'ETH',
    'stop_loss_triggered',
    'danger',
    '价格跌破止损位',
    3100,
    3150,
    'close_position',
    { currentPrice: 3100, stopPrice: 3150, positionSize: 1 }
  );
}

// =====================================================
// 示例 5: 日志查询
// =====================================================

function logQueryExample() {
  console.log('\n=== 日志查询示例 ===\n');

  // 查询最近的决策
  const recentDecisions = logger.getDecisions({ limit: 5 });
  console.log('最近的决策:', recentDecisions.length, '条');

  // 查询特定币种的交易
  const btcTrades = logger.getTrades({ coin: 'BTC', limit: 10 });
  console.log('BTC 的交易:', btcTrades.length, '条');

  // 获取决策统计
  const decisionStats = logger.getDecisionStats('BTC');
  console.log('BTC 决策统计:', decisionStats);

  // 获取交易统计
  const tradeStats = logger.getTradeStats('BTC');
  console.log('BTC 交易统计:', tradeStats);
}

// =====================================================
// 示例 6: 日志分析
// =====================================================

function logAnalysisExample() {
  console.log('\n=== 日志分析示例 ===\n');

  // 分析决策
  const decisionAnalysis = LogAnalyzer.analyzeDecisions({ coin: 'BTC' });
  console.log(LogAnalyzer.generateDecisionReport(decisionAnalysis));

  // 分析交易
  const tradeAnalysis = LogAnalyzer.analyzeTrades({ coin: 'BTC' });
  console.log(LogAnalyzer.generateTradeReport(tradeAnalysis));

  // 生成综合报告
  const comprehensiveReport = LogAnalyzer.generateComprehensiveReport({
    coin: 'BTC',
    startTime: Date.now() - 24 * 60 * 60 * 1000, // 最近24小时
    endTime: Date.now()
  });
  console.log(comprehensiveReport);
}

// =====================================================
// 示例 7: 导出日志
// =====================================================

function logExportExample() {
  console.log('\n=== 日志导出示例 ===\n');

  // 导出决策日志为 CSV
  const decisionsCSV = LogAnalyzer.exportDecisionsToCSV({
    coin: 'BTC',
    startTime: Date.now() - 7 * 24 * 60 * 60 * 1000, // 最近7天
    endTime: Date.now()
  });
  console.log('决策日志 CSV (前 200 字符):');
  console.log(decisionsCSV.substring(0, 200) + '...');

  // 导出交易日志为 CSV
  const tradesCSV = LogAnalyzer.exportTradesToCSV({
    coin: 'BTC',
    startTime: Date.now() - 7 * 24 * 60 * 60 * 1000,
    endTime: Date.now()
  });
  console.log('\n交易日志 CSV (前 200 字符):');
  console.log(tradesCSV.substring(0, 200) + '...');
}

// =====================================================
// 示例 8: 日志配置
// =====================================================

function logConfigurationExample() {
  console.log('\n=== 日志配置示例 ===\n');

  // 设置最低日志级别
  logger.setMinLevel(LogLevel.INFO);

  // 禁用控制台输出（仅存储到数据库）
  logger.setConsoleEnabled(false);

  // 禁用文件存储
  logger.setFileEnabled(false);

  // 启用 SQLite 存储
  logger.setSQLiteEnabled(true);

  console.log('日志配置已更新');
  console.log('- 最低级别: INFO');
  console.log('- 控制台: 禁用');
  console.log('- 文件: 禁用');
  console.log('- SQLite: 启用');
}

// =====================================================
// 示例 9: 日志清理
// =====================================================

function logCleanupExample() {
  console.log('\n=== 日志清理示例 ===\n');

  // 清理 30 天前的日志
  logger.cleanup(30);

  console.log('已清理 30 天前的日志');
}

// =====================================================
// 主函数
// =====================================================

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║          OKX 量化交易系统 - 日志系统使用示例                  ║
╚══════════════════════════════════════════════════════════════╝
  `);

  // 运行所有示例
  basicLoggingExample();
  decisionLoggingExample();
  tradeLoggingExample();
  riskLoggingExample();
  logQueryExample();
  logAnalysisExample();
  logExportExample();
  logConfigurationExample();
  logCleanupExample();

  console.log('\n=== 日志系统报告 ===\n');
  console.log(logger.generateReport());

  // 关闭日志系统
  await logger.shutdown();
  console.log('\n日志系统演示完成！');
}

// 运行示例
if (import.meta.main) {
  main().catch(console.error);
}
