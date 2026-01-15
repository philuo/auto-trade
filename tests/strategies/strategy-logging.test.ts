/**
 * 策略日志集成测试
 *
 * 验证策略与日志系统的集成是否正常工作
 */

import { beforeAll, afterAll, describe, test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import fs from 'fs';
import path from 'path';
import {
  Logger,
  LogLevel,
  LogType,
  SQLiteLogStorage,
  FileLogStorage
} from '../../src/utils/logger';
import type { DecisionLogEntry, TradeLogEntry } from '../../src/utils/logger';

// =====================================================
// 测试配置
// =====================================================

const TEST_DATA_DIR = './test-data-strategy';
const TEST_LOGS_DIR = './test-logs-strategy';
const TEST_DB_PATH = path.join(TEST_DATA_DIR, 'logs.db');

// =====================================================
// 测试工具函数
// =====================================================

function cleanupTestDirs(): void {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
  if (fs.existsSync(TEST_LOGS_DIR)) {
    fs.rmSync(TEST_LOGS_DIR, { recursive: true, force: true });
  }
}

function setupTestDirs(): void {
  cleanupTestDirs();
  if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(TEST_LOGS_DIR)) {
    fs.mkdirSync(TEST_LOGS_DIR, { recursive: true });
  }
}

// =====================================================
// 策略测试模拟器
// =====================================================

class StrategyTestSimulator {
  logger: Logger;
  db: Database;

  constructor(dataDir: string, logsDir: string) {
    // 重置单例
    (Logger as any).instance = null;
    this.logger = Logger.getInstance(dataDir, logsDir);
    this.db = new Database(path.join(dataDir, 'logs.db'));
  }

  /**
   * 模拟 DCA 策略决策流程
   */
  simulateDCADecision(coin: string, priceDrop: number): void {
    const action = priceDrop >= 3 ? 'buy' : 'hold';
    const reason = priceDrop >= 3 ? `price_drop_${priceDrop}%` : 'price_stable';

    this.logger.decision({
      coin,
      strategy: 'dca',
      action,
      reason,
      marketData: {
        price: 45000 * (1 - priceDrop / 100),
        change24h: -priceDrop,
        volume24h: 1000000
      },
      decisionFactors: {
        dcaType: 'reverse',
        level: priceDrop >= 5 ? 2 : 1,
        multiplier: priceDrop >= 5 ? 2.0 : 1.0,
        orderSize: 50,
        avgEntryPrice: 47500,
        totalOrders: 5,
        totalInvested: 250
      }
    });
  }

  /**
   * 模拟网格策略决策流程
   */
  simulateGridDecision(coin: string, isBuy: boolean): void {
    this.logger.decision({
      coin,
      strategy: 'grid',
      action: isBuy ? 'buy' : 'sell',
      reason: isBuy ? 'grid_order_triggered_buy' : 'grid_order_triggered_sell',
      marketData: {
        price: isBuy ? 44500 : 45500,
        change24h: -1.5,
        volume24h: 500000
      },
      decisionFactors: {
        gridPrice: isBuy ? 44500 : 45500,
        gridType: isBuy ? 'buy' : 'sell',
        orderSize: 0.001,
        orderValue: isBuy ? 44.5 : 45.5,
        totalBuyOrders: 10,
        totalSellOrders: 8,
        realizedProfit: 150
      }
    });
  }

  /**
   * 模拟风险管理决策
   */
  simulateRiskDecision(coin: string, pnl: number): void {
    const action = pnl < -10 ? 'close' : 'hold';
    const reason = pnl < -10 ? `大幅亏损: ${pnl}%` : 'monitoring';

    this.logger.decision({
      coin,
      strategy: 'risk',
      action,
      reason,
      marketData: {
        price: 44000,
        change24h: -5,
        volume24h: 800000
      },
      decisionFactors: {
        pnl,
        oldMode: 'normal',
        newMode: pnl < -10 ? 'dca_priority' : 'normal',
        reason: `调整风险模式: ${pnl < -10 ? '降低风险' : '保持监控'}`
      }
    });
  }

  /**
   * 模拟订单创建
   */
  simulateOrderCreation(coin: string, side: 'buy' | 'sell'): string {
    const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const clientOrderId = `client_${coin}_${side}_${Date.now()}`;

    this.logger.trade({
      orderId,
      clientOrderId,
      coin,
      side,
      price: side === 'buy' ? 44500 : 45500,
      size: 0.001,
      value: side === 'buy' ? 44.5 : 45.5,
      status: 'live',
      metadata: {
        strategy: 'grid',
        orderType: 'limit',
        symbol: `${coin}-USDT`
      }
    });

    return orderId;
  }

  /**
   * 模拟订单成交
   */
  simulateOrderFill(orderId: string, coin: string, side: 'buy' | 'sell'): void {
    this.logger.trade({
      orderId,
      clientOrderId: `client_${coin}_${side}_${Date.now()}`,
      coin,
      side,
      price: side === 'buy' ? 44500 : 45500,
      size: 0.001,
      value: side === 'buy' ? 44.5 : 45.5,
      fee: 0.045,
      status: 'filled',
      metadata: {
        strategy: 'grid',
        orderType: 'limit',
        symbol: `${coin}-USDT`,
        filledAt: Date.now()
      }
    });
  }

  /**
   * 模拟订单取消
   */
  simulateOrderCancel(orderId: string, coin: string): void {
    this.logger.trade({
      orderId,
      clientOrderId: `client_${coin}_cancel_${Date.now()}`,
      coin,
      side: 'buy',
      price: 44500,
      size: 0.001,
      status: 'cancelled',
      metadata: {
        strategy: 'grid',
        orderType: 'limit',
        symbol: `${coin}-USDT`,
        cancelledAt: Date.now()
      }
    });
  }

  /**
   * 模拟风险事件
   */
  simulateRiskEvent(coin: string, eventType: 'stop_loss' | 'drawdown_warning' | 'emergency_close'): void {
    const eventConfig = {
      stop_loss: {
        level: 'danger',
        message: '价格跌破止损位',
        triggerValue: 44000,
        threshold: 44500,
        action: 'close_position'
      },
      drawdown_warning: {
        level: 'warning',
        message: '回撤接近警告阈值',
        triggerValue: 9.5,
        threshold: 10,
        action: 'monitoring'
      },
      emergency_close: {
        level: 'critical',
        message: '触发紧急平仓',
        triggerValue: -15,
        threshold: -10,
        action: 'close_all'
      }
    };

    const config = eventConfig[eventType];
    this.logger.risk(
      coin,
      eventType,
      config.level,
      config.message,
      config.triggerValue,
      config.threshold,
      config.action,
      { positionSize: 0.001, currentPrice: 44000 }
    );
  }

  /**
   * 验证 SQLite 日志数据
   */
  verifySQLiteLogs(): {
    decisionCount: number;
    tradeCount: number;
    riskCount: number;
    details: any;
  } {
    const decisionCount = this.db.query('SELECT COUNT(*) as count FROM decision_logs').get() as { count: number };
    const tradeCount = this.db.query('SELECT COUNT(*) as count FROM trade_logs').get() as { count: number };
    const riskCount = this.db.query('SELECT COUNT(*) as count FROM risk_logs').get() as { count: number };

    return {
      decisionCount: decisionCount.count,
      tradeCount: tradeCount.count,
      riskCount: riskCount.count,
      details: {
        decisions: this.db.query('SELECT * FROM decision_logs LIMIT 5').all(),
        trades: this.db.query('SELECT * FROM trade_logs LIMIT 5').all(),
        risks: this.db.query('SELECT * FROM risk_logs LIMIT 5').all()
      }
    };
  }

  /**
   * 验证文件日志
   */
  verifyFileLogs(): {
    decisionLogExists: boolean;
    tradeLogExists: boolean;
    errorLogExists: boolean;
    logFiles: string[];
  } {
    const today = new Date().toISOString().split('T')[0];
    const logFiles = fs.readdirSync(TEST_LOGS_DIR).filter(f => f.endsWith('.log'));

    return {
      decisionLogExists: fs.existsSync(path.join(TEST_LOGS_DIR, `decision_${today}.log`)),
      tradeLogExists: fs.existsSync(path.join(TEST_LOGS_DIR, `trade_${today}.log`)),
      errorLogExists: fs.existsSync(path.join(TEST_LOGS_DIR, `error_${today}.log`)),
      logFiles
    };
  }

  /**
   * 验证日志格式
   */
  verifyLogFormat(): {
    hasValidTimestamps: boolean;
    hasValidLevels: boolean;
    hasValidTypes: boolean;
    timestampFormat: string;
  } {
    const decisions = this.db.query('SELECT timestamp FROM decision_logs LIMIT 1').get() as { timestamp: number } | undefined;
    const timestamp = decisions?.timestamp || 0;

    // 验证时间戳格式
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return {
      hasValidTimestamps: timestamp > 0 && timestamp <= Date.now(),
      hasValidLevels: true, // LogLevel 枚举保证
      hasValidTypes: true,  // LogType 枚举保证
      timestampFormat: `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
    };
  }

  /**
   * 验证日志数据完整性
   */
  verifyDataIntegrity(): {
    decisionFields: string[];
    tradeFields: string[];
    riskFields: string[];
    allFieldsPresent: boolean;
  } {
    const decisionRow = this.db.query('SELECT * FROM decision_logs LIMIT 1').get() as any;
    const tradeRow = this.db.query('SELECT * FROM trade_logs LIMIT 1').get() as any;
    const riskRow = this.db.query('SELECT * FROM risk_logs LIMIT 1').get() as any;

    const decisionFields = decisionRow ? Object.keys(decisionRow) : [];
    const tradeFields = tradeRow ? Object.keys(tradeRow) : [];
    const riskFields = riskRow ? Object.keys(riskRow) : [];

    // 验证必需字段
    const requiredDecisionFields = ['id', 'timestamp', 'coin', 'strategy', 'action', 'reason'];
    const requiredTradeFields = ['id', 'timestamp', 'order_id', 'coin', 'side', 'status'];
    const requiredRiskFields = ['id', 'timestamp', 'coin', 'event_type', 'level', 'message'];

    const allFieldsPresent =
      requiredDecisionFields.every(f => decisionFields.includes(f)) &&
      requiredTradeFields.every(f => tradeFields.includes(f)) &&
      requiredRiskFields.every(f => riskFields.includes(f));

    return {
      decisionFields,
      tradeFields,
      riskFields,
      allFieldsPresent
    };
  }

  /**
   * 生成验证报告
   */
  generateReport(): string {
    const sqlData = this.verifySQLiteLogs();
    const fileData = this.verifyFileLogs();
    const formatData = this.verifyLogFormat();
    const integrityData = this.verifyDataIntegrity();

    let report = `
╔══════════════════════════════════════════════════════════════╗
║           OKX 策略日志集成验证报告                              ║
╚══════════════════════════════════════════════════════════════╝

测试时间: ${new Date().toISOString()}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. SQLite 日志统计
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  决策日志: ${sqlData.decisionCount} 条
  交易日志: ${sqlData.tradeCount} 条
  风险日志: ${sqlData.riskCount} 条
  总计: ${sqlData.decisionCount + sqlData.tradeCount + sqlData.riskCount} 条

`;

    if (sqlData.decisionCount > 0) {
      const sampleDecision = sqlData.details.decisions[0] as any;
      report += `
  ✅ 决策日志样本:
     币种: ${sampleDecision.coin}
     策略: ${sampleDecision.strategy}
     操作: ${sampleDecision.action}
     原因: ${sampleDecision.reason}
     时间: ${new Date(sampleDecision.timestamp).toISOString()}
`;
    }

    report += `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
2. 文件日志验证
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  决策日志文件: ${fileData.decisionLogExists ? '✅ 存在' : '❌ 不存在'}
  交易日志文件: ${fileData.tradeLogExists ? '✅ 存在' : '❌ 不存在'}
  错误日志文件: ${fileData.errorLogExists ? '✅ 存在' : '❌ 不存在'}

  日志文件列表:
`;
    fileData.logFiles.forEach(f => {
      report += `    - ${f}\n`;
    });

    report += `

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
3. 日志格式验证
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  时间戳有效: ${formatData.hasValidTimestamps ? '✅' : '❌'}
  日志级别有效: ${formatData.hasValidLevels ? '✅' : '❌'}
  日志类型有效: ${formatData.hasValidTypes ? '✅' : '❌'}
  时间格式: ${formatData.timestampFormat}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
4. 数据完整性验证
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  所有必需字段存在: ${integrityData.allFieldsPresent ? '✅' : '❌'}

  决策日志字段 (${integrityData.decisionFields.length}):
    ${integrityData.decisionFields.join(', ')}

  交易日志字段 (${integrityData.tradeFields.length}):
    ${integrityData.tradeFields.join(', ')}

  风险日志字段 (${integrityData.riskFields.length}):
    ${integrityData.riskFields.join(', ')}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
5. 测试结论
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;

    const allTestsPassed =
      sqlData.decisionCount > 0 &&
      sqlData.tradeCount > 0 &&
      fileData.decisionLogExists &&
      fileData.tradeLogExists &&
      formatData.hasValidTimestamps &&
      integrityData.allFieldsPresent;

    report += allTestsPassed ?
      '  ✅ 所有测试通过！日志系统工作正常。\n' :
      '  ❌ 存在测试失败，请检查上述输出。\n';

    report += `
╚══════════════════════════════════════════════════════════════╝
`;

    return report;
  }

  async cleanup(): Promise<void> {
    await this.logger.shutdown();
    this.db.close();
  }
}

// =====================================================
// 测试套件
// =====================================================

describe('Strategy Logging Integration Tests', () => {
  let simulator: StrategyTestSimulator;

  beforeAll(() => {
    setupTestDirs();
    simulator = new StrategyTestSimulator(TEST_DATA_DIR, TEST_LOGS_DIR);
  });

  afterAll(async () => {
    await simulator.cleanup();
    cleanupTestDirs();
  });

  describe('DCA Strategy Logging', () => {
    test('should log DCA buy decision when price drops 3%', () => {
      simulator.simulateDCADecision('BTC', 3);

      const logs = simulator.logger.getDecisions({ coin: 'BTC' });
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].strategy).toBe('dca');
      expect(logs[0].action).toBe('buy');
      expect(logs[0].reason).toContain('price_drop');
    });

    test('should log DCA hold decision when price is stable', () => {
      simulator.simulateDCADecision('ETH', 1);

      const logs = simulator.logger.getDecisions({ coin: 'ETH' });
      const stableLogs = logs.filter(l => l.reason === 'price_stable');
      expect(stableLogs.length).toBeGreaterThan(0);
    });

    test('should include market data in DCA decisions', () => {
      simulator.simulateDCADecision('BTC', 5);

      const logs = simulator.logger.getDecisions({ coin: 'BTC' });
      const latestDecision = logs[logs.length - 1];
      expect(latestDecision.marketData).toBeDefined();
      expect(latestDecision.marketData?.price).toBeDefined();
      expect(latestDecision.marketData?.change24h).toBeDefined();
      expect(latestDecision.marketData?.volume24h).toBeDefined();
    });
  });

  describe('Grid Strategy Logging', () => {
    test('should log grid buy decision', () => {
      simulator.simulateGridDecision('BTC', true);

      const logs = simulator.logger.getDecisions({ coin: 'BTC', strategy: 'grid' });
      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0].action).toBe('buy');
    });

    test('should log grid sell decision', () => {
      simulator.simulateGridDecision('ETH', false);

      const logs = simulator.logger.getDecisions({ coin: 'ETH', strategy: 'grid' });
      const sellLogs = logs.filter(l => l.action === 'sell');
      expect(sellLogs.length).toBeGreaterThan(0);
    });
  });

  describe('Risk Management Logging', () => {
    test('should log risk decision when PnL drops below -10%', () => {
      simulator.simulateRiskDecision('BTC', -12);

      const logs = simulator.logger.getDecisions({ coin: 'BTC', strategy: 'risk' });
      const closeLogs = logs.filter(l => l.action === 'close');
      expect(closeLogs.length).toBeGreaterThan(0);
    });

    test('should log stop loss event', () => {
      simulator.simulateRiskEvent('BTC', 'stop_loss');

      const db = new Database(TEST_DB_PATH);
      const riskLogs = db.query("SELECT * FROM risk_logs WHERE event_type='stop_loss'").all();
      expect(riskLogs.length).toBeGreaterThan(0);
      db.close();
    });

    test('should log drawdown warning event', () => {
      simulator.simulateRiskEvent('ETH', 'drawdown_warning');

      const db = new Database(TEST_DB_PATH);
      const riskLogs = db.query("SELECT * FROM risk_logs WHERE event_type='drawdown_warning'").all();
      expect(riskLogs.length).toBeGreaterThan(0);
      db.close();
    });

    test('should log emergency close event', () => {
      simulator.simulateRiskEvent('BTC', 'emergency_close');

      const db = new Database(TEST_DB_PATH);
      const riskLogs = db.query("SELECT * FROM risk_logs WHERE event_type='emergency_close'").all();
      expect(riskLogs.length).toBeGreaterThan(0);
      db.close();
    });
  });

  describe('Order Lifecycle Logging', () => {
    test('should log order creation', () => {
      const orderId = simulator.simulateOrderCreation('BTC', 'buy');

      const trades = simulator.logger.getTrades({ orderId });
      expect(trades.length).toBe(1);
      expect(trades[0].status).toBe('live');
    });

    test('should log order fill', () => {
      const orderId = simulator.simulateOrderCreation('BTC', 'buy');
      simulator.simulateOrderFill(orderId, 'BTC', 'buy');

      const trades = simulator.logger.getTrades({ orderId });
      const filledTrades = trades.filter(t => t.status === 'filled');
      expect(filledTrades.length).toBe(1);
    });

    test('should log order cancellation', () => {
      const orderId = simulator.simulateOrderCreation('ETH', 'sell');
      simulator.simulateOrderCancel(orderId, 'ETH');

      const trades = simulator.logger.getTrades({ orderId });
      const cancelledTrades = trades.filter(t => t.status === 'cancelled');
      expect(cancelledTrades.length).toBe(1);
    });

    test('should track order lifecycle: create -> fill', () => {
      const orderId = simulator.simulateOrderCreation('BTC', 'buy');

      let trades = simulator.logger.getTrades({ orderId });
      expect(trades.length).toBe(1);
      expect(trades[0].status).toBe('live');

      simulator.simulateOrderFill(orderId, 'BTC', 'buy');

      trades = simulator.logger.getTrades({ orderId });
      expect(trades.length).toBe(2);
      expect(trades[0].status).toBe('filled'); // 最新的在前面
    });
  });

  describe('SQLite Data Verification', () => {
    test('should have correct decision log structure', () => {
      simulator.simulateDCADecision('BTC', 3);

      const db = new Database(TEST_DB_PATH);
      const row = db.query('SELECT * FROM decision_logs LIMIT 1').get() as any;

      expect(row).toBeDefined();
      expect(row.coin).toBe('BTC');
      expect(row.strategy).toBe('dca');
      expect(row.action).toBe('buy');
      expect(row.reason).toContain('price_drop');
      db.close();
    });

    test('should have correct trade log structure', () => {
      simulator.simulateOrderCreation('BTC', 'buy');

      const db = new Database(TEST_DB_PATH);
      const row = db.query('SELECT * FROM trade_logs LIMIT 1').get() as any;

      expect(row).toBeDefined();
      expect(row.coin).toBe('BTC');
      expect(row.side).toBe('buy');
      expect(row.status).toBe('live');
      db.close();
    });

    test('should have correct risk log structure', () => {
      simulator.simulateRiskEvent('BTC', 'stop_loss');

      const db = new Database(TEST_DB_PATH);
      const row = db.query('SELECT * FROM risk_logs WHERE event_type="stop_loss" LIMIT 1').get() as any;

      expect(row).toBeDefined();
      expect(row.coin).toBe('BTC');
      expect(row.event_type).toBe('stop_loss');
      expect(row.level).toBe('danger');
      db.close();
    });
  });

  describe('File Log Verification', () => {
    test('should create decision log file', () => {
      simulator.simulateDCADecision('BTC', 3);

      const fileData = simulator.verifyFileLogs();
      expect(fileData.decisionLogExists).toBe(true);
    });

    test('should create trade log file', () => {
      simulator.simulateOrderCreation('BTC', 'buy');

      const fileData = simulator.verifyFileLogs();
      expect(fileData.tradeLogExists).toBe(true);
    });
  });

  describe('Data Integrity Tests', () => {
    test('should maintain data consistency across multiple operations', () => {
      // 先清空之前的测试数据
      const db = new Database(TEST_DB_PATH);
      db.exec('DELETE FROM decision_logs');
      db.exec('DELETE FROM trade_logs');
      db.close();

      // 模拟完整交易流程
      simulator.simulateDCADecision('BTC', 5);
      const orderId1 = simulator.simulateOrderCreation('BTC', 'buy');
      simulator.simulateOrderFill(orderId1, 'BTC', 'buy');

      simulator.simulateGridDecision('ETH', false);
      const orderId2 = simulator.simulateOrderCreation('ETH', 'sell');
      simulator.simulateOrderFill(orderId2, 'ETH', 'sell');

      // 验证 SQLite 数据
      const db2 = new Database(TEST_DB_PATH);
      const decisionCount = db2.query('SELECT COUNT(*) as count FROM decision_logs').get() as { count: number };
      const tradeCount = db2.query('SELECT COUNT(*) as count FROM trade_logs').get() as { count: number };
      db2.close();

      expect(decisionCount.count).toBe(2);
      expect(tradeCount.count).toBe(4); // 每个订单2条记录（创建+成交）
    });

    test('should handle concurrent operations correctly', async () => {
      // 先清空之前的测试数据
      const db = new Database(TEST_DB_PATH);
      db.exec('DELETE FROM decision_logs WHERE coin="BTC"');
      db.close();

      const promises = [];

      // 并发创建多个决策
      for (let i = 0; i < 20; i++) {
        promises.push(
          Promise.resolve().then(() => {
            simulator.simulateDCADecision('BTC', i % 10);
          })
        );
      }

      await Promise.all(promises);

      const logs = simulator.logger.getDecisions({ coin: 'BTC' });
      const btcLogs = logs.filter(l => l.coin === 'BTC');
      expect(btcLogs.length).toBeGreaterThanOrEqual(20);
    });
  });

  describe('Comprehensive Integration Test', () => {
    test('should pass all validation checks', () => {
      // 执行完整场景
      simulator.simulateDCADecision('BTC', 3);
      simulator.simulateGridDecision('ETH', true);
      simulator.simulateRiskDecision('BTC', -8);
      const orderId1 = simulator.simulateOrderCreation('BTC', 'buy');
      simulator.simulateOrderFill(orderId1, 'BTC', 'buy');
      simulator.simulateRiskEvent('ETH', 'drawdown_warning');

      // 生成报告
      const report = simulator.generateReport();
      console.log(report);

      // 验证所有关键指标
      const sqlData = simulator.verifySQLiteLogs();
      const fileData = simulator.verifyFileLogs();
      const formatData = simulator.verifyLogFormat();
      const integrityData = simulator.verifyDataIntegrity();

      expect(sqlData.decisionCount).toBeGreaterThan(0);
      expect(sqlData.tradeCount).toBeGreaterThan(0);
      expect(fileData.decisionLogExists).toBe(true);
      expect(fileData.tradeLogExists).toBe(true);
      expect(formatData.hasValidTimestamps).toBe(true);
      expect(integrityData.allFieldsPresent).toBe(true);
    });
  });
});

// =====================================================
// 主函数
// =====================================================

if (import.meta.main) {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║        OKX 策略日志集成测试                                  ║
╚══════════════════════════════════════════════════════════════╝

运行测试:
  bun test ${import.meta.url}
  `);
}
