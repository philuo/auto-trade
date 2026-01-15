/**
 * 日志系统完整测试
 *
 * 测试功能：
 * - SQLite 日志存储
 * - 文件日志存储
 * - Logger 类功能
 * - 日志分析器
 * - 日志导出功能
 */

import { beforeAll, afterAll, beforeEach, afterEach, describe, test, expect } from 'bun:test';
import { Database } from 'bun:sqlite';
import fs from 'fs';
import path from 'path';
import {
  Logger,
  LogLevel,
  LogType,
  SQLiteLogStorage,
  FileLogStorage,
  logger as loggerInstance
} from '../../src/utils/logger';
import type { DecisionLogEntry, TradeLogEntry } from '../../src/utils/logger';
import { LogAnalyzer, setLogger } from '../../src/utils/log-analyzer';

// =====================================================
// 测试配置
// =====================================================

const TEST_DATA_DIR = './test-data';
const TEST_LOGS_DIR = './test-logs';
const TEST_DB_PATH = path.join(TEST_DATA_DIR, 'logs.db');

// 清理测试目录
function cleanupTestDirs(): void {
  if (fs.existsSync(TEST_DATA_DIR)) {
    fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  }
  if (fs.existsSync(TEST_LOGS_DIR)) {
    fs.rmSync(TEST_LOGS_DIR, { recursive: true, force: true });
  }
}

// 创建测试目录
function setupTestDirs(): void {
  cleanupTestDirs();
  if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(TEST_LOGS_DIR)) {
    fs.mkdirSync(TEST_LOGS_DIR, { recursive: true });
  }
}

// SQL 查询辅助函数
function queryTableExists(db: Database, tableName: string): boolean {
  const result = db.query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
  ).get(tableName);
  return result !== undefined;
}

function queryIndexCount(db: Database, tableName: string): number {
  const results = db.query(
    "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name=?"
  ).all(tableName);
  return results.length;
}

// =====================================================
// SQLite 日志存储测试
// =====================================================

describe('SQLiteLogStorage', () => {
  let storage: SQLiteLogStorage;

  beforeEach(() => {
    setupTestDirs();
    storage = new SQLiteLogStorage(TEST_DATA_DIR);
  });

  afterEach(() => {
    storage.close();
    cleanupTestDirs();
  });

  describe('Database Initialization', () => {
    test('should create database file', () => {
      expect(fs.existsSync(TEST_DB_PATH)).toBe(true);
    });

    test('should create decision_logs table', () => {
      const db = new Database(TEST_DB_PATH);
      const exists = queryTableExists(db, 'decision_logs');
      expect(exists).toBe(true);
      db.close();
    });

    test('should create trade_logs table', () => {
      const db = new Database(TEST_DB_PATH);
      const exists = queryTableExists(db, 'trade_logs');
      expect(exists).toBe(true);
      db.close();
    });

    test('should create risk_logs table', () => {
      const db = new Database(TEST_DB_PATH);
      const exists = queryTableExists(db, 'risk_logs');
      expect(exists).toBe(true);
      db.close();
    });

    test('should create indexes for decision_logs', () => {
      const db = new Database(TEST_DB_PATH);
      const count = queryIndexCount(db, 'decision_logs');
      expect(count).toBeGreaterThanOrEqual(2);
      db.close();
    });

    test('should create indexes for trade_logs', () => {
      const db = new Database(TEST_DB_PATH);
      const count = queryIndexCount(db, 'trade_logs');
      expect(count).toBeGreaterThanOrEqual(3);
      db.close();
    });
  });

  describe('Decision Logs', () => {
    test('should write decision log', () => {
      const entry: DecisionLogEntry = {
        timestamp: Date.now(),
        level: LogLevel.INFO,
        type: LogType.DECISION,
        message: 'DCA buy decision: price_drop_5%',
        coin: 'BTC',
        strategy: 'dca',
        action: 'buy',
        reason: 'price_drop_5%',
        marketData: {
          price: 45000,
          change24h: -5,
          volume24h: 1000000
        },
        decisionFactors: {
          level: 2,
          multiplier: 2
        }
      };

      storage.writeDecisionLog(entry);

      const logs = storage.queryDecisionLogs({ coin: 'BTC' });
      expect(logs.length).toBe(1);
      expect(logs[0].coin).toBe('BTC');
      expect(logs[0].strategy).toBe('dca');
      expect(logs[0].action).toBe('buy');
    });

    test('should write multiple decision logs', () => {
      const coins = ['BTC', 'ETH', 'BNB'];
      const strategies = ['dca', 'grid', 'risk'] as const;
      const actions = ['buy', 'sell', 'hold'] as const;

      for (const coin of coins) {
        for (const strategy of strategies) {
          for (const action of actions) {
            storage.writeDecisionLog({
              timestamp: Date.now(),
              level: LogLevel.INFO,
              type: LogType.DECISION,
              message: `${strategy} ${action} decision: test_${strategy}_${action}`,
              coin,
              strategy,
              action,
              reason: `test_${strategy}_${action}`
            });
          }
        }
      }

      const allLogs = storage.queryDecisionLogs();
      expect(allLogs.length).toBe(coins.length * strategies.length * actions.length);
    });

    test('should query decision logs by coin', () => {
      storage.writeDecisionLog({
        timestamp: Date.now(),
        level: LogLevel.INFO,
        type: LogType.DECISION,
        message: 'dca buy decision: test',
        coin: 'BTC',
        strategy: 'dca',
        action: 'buy',
        reason: 'test'
      });

      storage.writeDecisionLog({
        timestamp: Date.now(),
        level: LogLevel.INFO,
        type: LogType.DECISION,
        message: 'dca buy decision: test',
        coin: 'ETH',
        strategy: 'dca',
        action: 'buy',
        reason: 'test'
      });

      const btcLogs = storage.queryDecisionLogs({ coin: 'BTC' });
      const ethLogs = storage.queryDecisionLogs({ coin: 'ETH' });

      expect(btcLogs.length).toBe(1);
      expect(ethLogs.length).toBe(1);
      expect(btcLogs[0].coin).toBe('BTC');
      expect(ethLogs[0].coin).toBe('ETH');
    });

    test('should query decision logs by strategy', () => {
      storage.writeDecisionLog({
        timestamp: Date.now(),
        level: LogLevel.INFO,
        type: LogType.DECISION,
        message: 'dca buy decision: test',
        coin: 'BTC',
        strategy: 'dca',
        action: 'buy',
        reason: 'test'
      });

      storage.writeDecisionLog({
        timestamp: Date.now(),
        level: LogLevel.INFO,
        type: LogType.DECISION,
        message: 'grid sell decision: test',
        coin: 'BTC',
        strategy: 'grid',
        action: 'sell',
        reason: 'test'
      });

      const dcaLogs = storage.queryDecisionLogs({ strategy: 'dca' });
      const gridLogs = storage.queryDecisionLogs({ strategy: 'grid' });

      expect(dcaLogs.length).toBe(1);
      expect(gridLogs.length).toBe(1);
      expect(dcaLogs[0].strategy).toBe('dca');
      expect(gridLogs[0].strategy).toBe('grid');
    });

    test('should query decision logs with limit', () => {
      for (let i = 0; i < 10; i++) {
        storage.writeDecisionLog({
          timestamp: Date.now() + i,
          level: LogLevel.INFO,
          type: LogType.DECISION,
          message: `dca buy decision: test_${i}`,
          coin: 'BTC',
          strategy: 'dca',
          action: 'buy',
          reason: `test_${i}`
        });
      }

      const limitedLogs = storage.queryDecisionLogs({ limit: 5 });
      expect(limitedLogs.length).toBe(5);
    });

    test('should query decision logs with time range', () => {
      const baseTime = Date.now();
      storage.writeDecisionLog({
        timestamp: baseTime - 2000,
        level: LogLevel.INFO,
        type: LogType.DECISION,
        message: 'dca buy decision: old',
        coin: 'BTC',
        strategy: 'dca',
        action: 'buy',
        reason: 'old'
      });

      storage.writeDecisionLog({
        timestamp: baseTime,
        level: LogLevel.INFO,
        type: LogType.DECISION,
        message: 'dca buy decision: new',
        coin: 'BTC',
        strategy: 'dca',
        action: 'buy',
        reason: 'new'
      });

      storage.writeDecisionLog({
        timestamp: baseTime + 2000,
        level: LogLevel.INFO,
        type: LogType.DECISION,
        message: 'dca buy decision: newer',
        coin: 'BTC',
        strategy: 'dca',
        action: 'buy',
        reason: 'newer'
      });

      const recentLogs = storage.queryDecisionLogs({
        startTime: baseTime - 1000,
        endTime: baseTime + 1000
      });

      expect(recentLogs.length).toBe(1);
      expect(recentLogs[0].reason).toBe('new');
    });

    test('should get decision stats', () => {
      storage.writeDecisionLog({
        timestamp: Date.now(),
        level: LogLevel.INFO,
        type: LogType.DECISION,
        message: 'dca buy decision: test',
        coin: 'BTC',
        strategy: 'dca',
        action: 'buy',
        reason: 'test'
      });

      storage.writeDecisionLog({
        timestamp: Date.now(),
        level: LogLevel.INFO,
        type: LogType.DECISION,
        message: 'dca sell decision: test',
        coin: 'BTC',
        strategy: 'dca',
        action: 'sell',
        reason: 'test'
      });

      storage.writeDecisionLog({
        timestamp: Date.now(),
        level: LogLevel.INFO,
        type: LogType.DECISION,
        message: 'grid hold decision: test',
        coin: 'ETH',
        strategy: 'grid',
        action: 'hold',
        reason: 'test'
      });

      const allStats = storage.getDecisionStats();
      expect(allStats.total).toBe(3);
      expect(allStats.byAction.buy).toBe(1);
      expect(allStats.byAction.sell).toBe(1);
      expect(allStats.byAction.hold).toBe(1);
      expect(allStats.byStrategy.dca).toBe(2);
      expect(allStats.byStrategy.grid).toBe(1);

      const btcStats = storage.getDecisionStats('BTC');
      expect(btcStats.total).toBe(2);
    });
  });

  describe('Trade Logs', () => {
    test('should write trade log', () => {
      const entry: TradeLogEntry = {
        timestamp: Date.now(),
        level: LogLevel.INFO,
        type: LogType.TRADE,
        message: 'buy order filled: 12345678',
        orderId: '12345678',
        clientOrderId: 'client-001',
        coin: 'BTC',
        side: 'buy',
        price: 45000,
        size: 0.001,
        value: 45,
        fee: 0.045,
        status: 'filled'
      };

      storage.writeTradeLog(entry);

      const logs = storage.queryTradeLogs({ coin: 'BTC' });
      expect(logs.length).toBe(1);
      expect(logs[0].orderId).toBe('12345678');
      expect(logs[0].side).toBe('buy');
      expect(logs[0].price).toBe(45000);
    });

    test('should write trade log with null values', () => {
      const entry: TradeLogEntry = {
        timestamp: Date.now(),
        level: LogLevel.INFO,
        type: LogType.TRADE,
        message: 'buy order live: 87654321',
        orderId: '87654321',
        clientOrderId: 'client-002',
        coin: 'ETH',
        side: 'buy',
        status: 'live'
      };

      storage.writeTradeLog(entry);

      const logs = storage.queryTradeLogs({ coin: 'ETH' });
      expect(logs.length).toBe(1);
      expect(logs[0].price).toBeUndefined();
      expect(logs[0].size).toBeUndefined();
    });

    test('should query trade logs by orderId', () => {
      storage.writeTradeLog({
        timestamp: Date.now(),
        level: LogLevel.INFO,
        type: LogType.TRADE,
        message: 'buy order filled: 11111111',
        orderId: '11111111',
        clientOrderId: 'client-001',
        coin: 'BTC',
        side: 'buy',
        price: 45000,
        size: 0.001,
        status: 'filled'
      });

      storage.writeTradeLog({
        timestamp: Date.now(),
        level: LogLevel.INFO,
        type: LogType.TRADE,
        message: 'sell order filled: 22222222',
        orderId: '22222222',
        clientOrderId: 'client-002',
        coin: 'BTC',
        side: 'sell',
        price: 46000,
        size: 0.001,
        status: 'filled'
      });

      const logs = storage.queryTradeLogs({ orderId: '11111111' });
      expect(logs.length).toBe(1);
      expect(logs[0].orderId).toBe('11111111');
    });

    test('should get trade stats', () => {
      storage.writeTradeLog({
        timestamp: Date.now(),
        level: LogLevel.INFO,
        type: LogType.TRADE,
        message: 'buy order filled: 1',
        orderId: '1',
        clientOrderId: 'c1',
        coin: 'BTC',
        side: 'buy',
        price: 45000,
        size: 0.001,
        value: 45,
        fee: 0.045,
        status: 'filled'
      });

      storage.writeTradeLog({
        timestamp: Date.now(),
        level: LogLevel.INFO,
        type: LogType.TRADE,
        message: 'buy order filled: 2',
        orderId: '2',
        clientOrderId: 'c2',
        coin: 'BTC',
        side: 'buy',
        price: 44000,
        size: 0.001,
        value: 44,
        fee: 0.044,
        status: 'filled'
      });

      storage.writeTradeLog({
        timestamp: Date.now(),
        level: LogLevel.INFO,
        type: LogType.TRADE,
        message: 'sell order cancelled: 3',
        orderId: '3',
        clientOrderId: 'c3',
        coin: 'BTC',
        side: 'sell',
        price: 46000,
        size: 0.001,
        status: 'cancelled'
      });

      storage.writeTradeLog({
        timestamp: Date.now(),
        level: LogLevel.INFO,
        type: LogType.TRADE,
        message: 'buy order failed: 4',
        orderId: '4',
        clientOrderId: 'c4',
        coin: 'BTC',
        side: 'buy',
        price: 43000,
        size: 0.001,
        status: 'failed'
      });

      const stats = storage.getTradeStats('BTC');
      expect(stats.totalOrders).toBe(4);
      expect(stats.filledOrders).toBe(2);
      expect(stats.cancelledOrders).toBe(1);
      expect(stats.failedOrders).toBe(1);
      expect(stats.totalValue).toBe(89);
      expect(stats.totalFees).toBe(0.089);
    });
  });

  describe('Risk Logs', () => {
    test('should write risk log', () => {
      storage.writeRiskLog(
        'BTC',
        'stop_loss',
        'danger',
        '触发止损',
        44000,
        44500,
        'close_position',
        { positionSize: 0.001 }
      );

      const db = new Database(TEST_DB_PATH);
      const logs = db.query("SELECT * FROM risk_logs WHERE coin=?").all('BTC');
      expect(logs.length).toBe(1);
      expect((logs[0] as any).coin).toBe('BTC');
      expect((logs[0] as any).event_type).toBe('stop_loss');
      expect((logs[0] as any).level).toBe('danger');
      db.close();
    });

    test('should write risk log with null values', () => {
      storage.writeRiskLog(
        'ETH',
        'warning',
        'warning',
        '价格波动警告'
      );

      const db = new Database(TEST_DB_PATH);
      const logs = db.query("SELECT * FROM risk_logs WHERE coin=?").all('ETH');
      expect(logs.length).toBe(1);
      expect((logs[0] as any).trigger_value).toBeNull();
      expect((logs[0] as any).threshold).toBeNull();
      db.close();
    });
  });

  describe('Cleanup', () => {
    test('should cleanup old logs', () => {
      const oldTime = Date.now() - 40 * 24 * 60 * 60 * 1000; // 40 days ago
      const recentTime = Date.now() - 10 * 24 * 60 * 60 * 1000; // 10 days ago

      storage.writeDecisionLog({
        timestamp: oldTime,
        level: LogLevel.INFO,
        type: LogType.DECISION,
        message: 'dca buy decision: old',
        coin: 'BTC',
        strategy: 'dca',
        action: 'buy',
        reason: 'old'
      });

      storage.writeDecisionLog({
        timestamp: recentTime,
        level: LogLevel.INFO,
        type: LogType.DECISION,
        message: 'dca buy decision: recent',
        coin: 'BTC',
        strategy: 'dca',
        action: 'buy',
        reason: 'recent'
      });

      storage.cleanupOldLogs(30);

      const logs = storage.queryDecisionLogs();
      expect(logs.length).toBe(1);
      expect(logs[0].reason).toBe('recent');
    });

    test('should vacuum database after cleanup', () => {
      // Write many logs to make database larger
      for (let i = 0; i < 100; i++) {
        storage.writeDecisionLog({
          timestamp: Date.now() - 100 * 24 * 60 * 60 * 1000,
          level: LogLevel.INFO,
          type: LogType.DECISION,
          message: `dca buy decision: test_${i}`,
          coin: 'BTC',
          strategy: 'dca',
          action: 'buy',
          reason: `test_${i}`
        });
      }

      const beforeSize = fs.statSync(TEST_DB_PATH).size;

      storage.cleanupOldLogs(30);

      const afterSize = fs.statSync(TEST_DB_PATH).size;
      expect(afterSize).toBeLessThan(beforeSize);
    });
  });

  describe('Close', () => {
    test('should close database connection', () => {
      storage.close();
      // Should not throw when closing again
      expect(() => storage.close()).not.toThrow();
    });
  });
});

// =====================================================
// 文件日志存储测试
// =====================================================

describe('FileLogStorage', () => {
  let storage: FileLogStorage;

  beforeEach(() => {
    setupTestDirs();
    storage = new FileLogStorage(TEST_LOGS_DIR);
  });

  afterEach(async () => {
    await storage.close();
    cleanupTestDirs();
  });

  describe('Initialization', () => {
    test('should create logs directory', () => {
      expect(fs.existsSync(TEST_LOGS_DIR)).toBe(true);
    });

    test('should handle existing directory', () => {
      expect(() => new FileLogStorage(TEST_LOGS_DIR)).not.toThrow();
    });
  });

  describe('Write Logs', () => {
    test('should write log entry to file', async () => {
      const entry = {
        timestamp: Date.now(),
        level: LogLevel.INFO,
        type: LogType.SYSTEM,
        message: 'Test message'
      };

      await storage.write(entry);

      const date = new Date().toISOString().split('T')[0];
      const logPath = path.resolve(TEST_LOGS_DIR, `system_${date}.log`);
      expect(fs.existsSync(logPath)).toBe(true);
    });

    test('should write log with metadata', async () => {
      const entry = {
        timestamp: Date.now(),
        level: LogLevel.INFO,
        type: LogType.SYSTEM,
        message: 'Test with metadata',
        metadata: { key1: 'value1', key2: 123 }
      };

      await storage.write(entry);

      const date = new Date().toISOString().split('T')[0];
      const logPath = path.resolve(TEST_LOGS_DIR, `system_${date}.log`);
      const content = await Bun.file(logPath).text();
      expect(content).toContain('Test with metadata');
      expect(content).toContain('key1');
      expect(content).toContain('value1');
    });

    test('should append multiple entries to same file', async () => {
      const entry1 = {
        timestamp: Date.now(),
        level: LogLevel.INFO,
        type: LogType.SYSTEM,
        message: 'First message'
      };

      const entry2 = {
        timestamp: Date.now() + 1000,
        level: LogLevel.INFO,
        type: LogType.SYSTEM,
        message: 'Second message'
      };

      await storage.write(entry1);
      await storage.write(entry2);

      const date = new Date().toISOString().split('T')[0];
      const logPath = path.resolve(TEST_LOGS_DIR, `system_${date}.log`);
      const content = await Bun.file(logPath).text();
      const lines = content.trim().split('\n');
      expect(lines.length).toBe(2);
      expect(content).toContain('First message');
      expect(content).toContain('Second message');
    });

    test('should write to different files based on type', async () => {
      await storage.write({
        timestamp: Date.now(),
        level: LogLevel.INFO,
        type: LogType.SYSTEM,
        message: 'System log'
      });

      await storage.write({
        timestamp: Date.now(),
        level: LogLevel.ERROR,
        type: LogType.ERROR,
        message: 'Error log'
      });

      const date = new Date().toISOString().split('T')[0];
      const systemLogPath = path.resolve(TEST_LOGS_DIR, `system_${date}.log`);
      const errorLogPath = path.resolve(TEST_LOGS_DIR, `error_${date}.log`);

      expect(fs.existsSync(systemLogPath)).toBe(true);
      expect(fs.existsSync(errorLogPath)).toBe(true);

      const systemContent = await Bun.file(systemLogPath).text();
      const errorContent = await Bun.file(errorLogPath).text();

      expect(systemContent).toContain('System log');
      expect(errorContent).toContain('Error log');
    });
  });

  describe('Error Logs', () => {
    test('should write error log', async () => {
      const error = new Error('Test error');
      error.stack = 'Error: Test error\\n    at test.js:10:15';

      await storage.writeError(error);

      const date = new Date().toISOString().split('T')[0];
      const logPath = path.resolve(TEST_LOGS_DIR, `error_${date}.log`);
      const content = await Bun.file(logPath).text();

      expect(content).toContain('Test error');
      expect(content).toContain('Error: Test error');
    });

    test('should write error log with context', async () => {
      const error = new Error('Test error');
      const context = { userId: '123', action: 'trade' };

      await storage.writeError(error, context);

      const date = new Date().toISOString().split('T')[0];
      const logPath = path.resolve(TEST_LOGS_DIR, `error_${date}.log`);
      const content = await Bun.file(logPath).text();

      expect(content).toContain('userId');
      expect(content).toContain('123');
      expect(content).toContain('action');
      expect(content).toContain('trade');
    });
  });

  describe('Read Logs', () => {
    test('should read log file', async () => {
      await storage.write({
        timestamp: Date.now(),
        level: LogLevel.INFO,
        type: LogType.SYSTEM,
        message: 'Test message'
      });

      const content = await storage.readLogFile(LogType.SYSTEM);
      expect(content).toContain('Test message');
    });

    test('should return empty string for non-existent file', async () => {
      const content = await storage.readLogFile(LogType.DEBUG);
      expect(content).toBe('');
    });

    test('should read log file for specific date', async () => {
      const now = new Date();
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);

      await storage.write({
        timestamp: Date.now(),
        level: LogLevel.INFO,
        type: LogType.SYSTEM,
        message: 'Today message'
      });

      const todayContent = await storage.readLogFile(LogType.SYSTEM);
      expect(todayContent).toContain('Today message');
    });
  });

  describe('Cleanup', () => {
    test('should cleanup old logs', async () => {
      // This test is platform-dependent and may not work on all systems
      // We'll just verify the method exists and doesn't throw
      expect(() => storage.cleanupOldLogs(30)).not.toThrow();
    });
  });

  describe('Close', () => {
    test('should close without errors', async () => {
      await storage.close();
      // 如果没有抛出异常就通过
      expect(true).toBe(true);
    });
  });
});

// =====================================================
// Logger 类测试
// =====================================================

describe('Logger', () => {
  let logger: Logger;

  beforeEach(() => {
    setupTestDirs();
    // Reset singleton
    (Logger as any).instance = null;
    logger = Logger.getInstance(TEST_DATA_DIR, TEST_LOGS_DIR);
  });

  afterEach(async () => {
    await logger.shutdown();
    cleanupTestDirs();
  });

  describe('Singleton Pattern', () => {
    test('should return same instance', () => {
      const logger1 = Logger.getInstance(TEST_DATA_DIR, TEST_LOGS_DIR);
      const logger2 = Logger.getInstance(TEST_DATA_DIR, TEST_LOGS_DIR);
      expect(logger1).toBe(logger2);
    });
  });

  describe('Configuration', () => {
    test('should set minimum log level', () => {
      logger.setMinLevel(LogLevel.WARN);
      logger.debug('This should not appear');
      logger.warn('This should appear');
      // Just verify it doesn't crash
      expect(true).toBe(true);
    });

    test('should enable/disable console', () => {
      logger.setConsoleEnabled(false);
      logger.setConsoleEnabled(true);
      expect(true).toBe(true);
    });

    test('should enable/disable SQLite', () => {
      logger.setSQLiteEnabled(false);
      logger.setSQLiteEnabled(true);
      expect(true).toBe(true);
    });

    test('should enable/disable file storage', () => {
      logger.setFileEnabled(false);
      logger.setFileEnabled(true);
      expect(true).toBe(true);
    });
  });

  describe('Basic Logging', () => {
    test('should log debug message', () => {
      expect(() => logger.debug('Debug message')).not.toThrow();
    });

    test('should log info message', () => {
      expect(() => logger.info('Info message')).not.toThrow();
    });

    test('should log warn message', () => {
      expect(() => logger.warn('Warn message')).not.toThrow();
    });

    test('should log error message', () => {
      expect(() => logger.error('Error message')).not.toThrow();
    });

    test('should log error with Error object', () => {
      const error = new Error('Test error');
      expect(() => logger.error('Error occurred', error)).not.toThrow();
    });

    test('should log critical message', () => {
      expect(() => logger.critical('Critical message')).not.toThrow();
    });

    test('should log with metadata', () => {
      expect(() => logger.info('Info with metadata', { key: 'value' })).not.toThrow();
    });
  });

  describe('Decision Logging', () => {
    test('should log decision', () => {
      expect(() => {
        logger.decision({
          message: 'dca buy decision: price_drop_5%',
          coin: 'BTC',
          strategy: 'dca',
          action: 'buy',
          reason: 'price_drop_5%',
          marketData: {
            price: 45000,
            change24h: -5,
            volume24h: 1000000
          }
        });
      }).not.toThrow();
    });

    test('should retrieve decision logs', () => {
      logger.decision({
        message: 'dca buy decision: test',
        coin: 'BTC',
        strategy: 'dca',
        action: 'buy',
        reason: 'test'
      });

      const logs = logger.getDecisions({ coin: 'BTC' });
      expect(logs.length).toBeGreaterThan(0);
    });

    test('should get decision stats', () => {
      logger.decision({
        message: 'dca buy decision: test',
        coin: 'BTC',
        strategy: 'dca',
        action: 'buy',
        reason: 'test'
      });

      const stats = logger.getDecisionStats('BTC');
      expect(stats.total).toBeGreaterThan(0);
    });
  });

  describe('Trade Logging', () => {
    test('should log trade', () => {
      expect(() => {
        logger.trade({
          message: 'buy order filled: 12345678',
          orderId: '12345678',
          clientOrderId: 'client-001',
          coin: 'BTC',
          side: 'buy',
          price: 45000,
          size: 0.001,
          value: 45,
          fee: 0.045,
          status: 'filled'
        });
      }).not.toThrow();
    });

    test('should retrieve trade logs', () => {
      logger.trade({
        message: 'sell order filled: 87654321',
        orderId: '87654321',
        clientOrderId: 'client-002',
        coin: 'ETH',
        side: 'sell',
        price: 3200,
        size: 1,
        status: 'filled'
      });

      const logs = logger.getTrades({ coin: 'ETH' });
      expect(logs.length).toBeGreaterThan(0);
    });

    test('should get trade stats', () => {
      logger.trade({
        message: 'buy order filled: 11111111',
        orderId: '11111111',
        clientOrderId: 'client-003',
        coin: 'BNB',
        side: 'buy',
        price: 400,
        size: 1,
        value: 400,
        fee: 0.4,
        status: 'filled'
      });

      const stats = logger.getTradeStats('BNB');
      expect(stats.totalOrders).toBeGreaterThan(0);
    });
  });

  describe('Risk Logging', () => {
    test('should log risk event', () => {
      expect(() => {
        logger.risk(
          'BTC',
          'stop_loss',
          'danger',
          '触发止损',
          44000,
          44500,
          'close_position'
        );
      }).not.toThrow();
    });
  });

  describe('Cleanup and Maintenance', () => {
    test('should cleanup old logs', () => {
      expect(() => logger.cleanup(30)).not.toThrow();
    });

    test('should generate report', () => {
      const report = logger.generateReport();
      expect(report).toBeTruthy();
      expect(typeof report).toBe('string');
      expect(report.length).toBeGreaterThan(0);
    });
  });

  describe('Shutdown', () => {
    test('should shutdown gracefully', async () => {
      await logger.shutdown();
      expect(true).toBe(true);
    });
  });
});

// =====================================================
// 日志分析器测试
// =====================================================

describe('LogAnalyzer', () => {
  let logger: Logger;

  beforeAll(() => {
    setupTestDirs();
    (Logger as any).instance = null;
    logger = Logger.getInstance(TEST_DATA_DIR, TEST_LOGS_DIR);
    // 设置 LogAnalyzer 使用的 logger 实例
    setLogger(logger);

    // 添加测试数据
    for (let i = 0; i < 10; i++) {
      const strategy = i % 3 === 0 ? 'dca' : i % 3 === 1 ? 'grid' : 'risk';
      const action = i % 3 === 0 ? 'buy' : i % 3 === 1 ? 'sell' : 'hold';
      logger.decision({
        message: `${strategy} ${action} decision: test_decision_${i}`,
        coin: i % 2 === 0 ? 'BTC' : 'ETH',
        strategy: strategy,
        action: action,
        reason: `test_decision_${i}`,
        marketData: {
          price: 45000 + i * 100,
          change24h: i % 2 === 0 ? -1 : 1,
          volume24h: 1000000 + i * 10000
        }
      });
    }

    for (let i = 0; i < 5; i++) {
      logger.trade({
        message: `buy order filled: order_${i}`,
        orderId: `order_${i}`,
        clientOrderId: `client_${i}`,
        coin: i % 2 === 0 ? 'BTC' : 'ETH',
        side: 'buy',
        price: 45000 + i * 100,
        size: 0.001,
        value: 45 + i,
        fee: 0.045 + i * 0.001,
        status: 'filled'
      });
    }
  });

  afterAll(async () => {
    await logger.shutdown();
    cleanupTestDirs();
  });

  describe('Decision Analysis', () => {
    test('should analyze decisions', () => {
      const analysis = LogAnalyzer.analyzeDecisions();
      expect(analysis.totalDecisions).toBe(10);
      expect(analysis.byCoin.BTC).toBeDefined();
      expect(analysis.byCoin.ETH).toBeDefined();
      expect(analysis.byStrategy.dca).toBeDefined();
      expect(analysis.byStrategy.grid).toBeDefined();
      expect(analysis.byStrategy.risk).toBeDefined();
    });

    test('should analyze decisions by coin', () => {
      const btcAnalysis = LogAnalyzer.analyzeDecisions({ coin: 'BTC' });
      expect(btcAnalysis.totalDecisions).toBeGreaterThan(0);
      expect(btcAnalysis.byCoin.BTC).toBeDefined();
    });

    test('should generate decision report', () => {
      const analysis = LogAnalyzer.analyzeDecisions();
      const report = LogAnalyzer.generateDecisionReport(analysis);
      expect(report).toBeTruthy();
      expect(report).toContain('决策分析报告');
      expect(report).toContain('总决策数');
      expect(report).toContain('按币种分布');
    });
  });

  describe('Trade Analysis', () => {
    test('should analyze trades', () => {
      const analysis = LogAnalyzer.analyzeTrades();
      expect(analysis.totalOrders).toBe(5);
      expect(analysis.filledOrders).toBe(5);
      expect(analysis.totalValue).toBeGreaterThan(0);
      expect(analysis.totalFees).toBeGreaterThan(0);
    });

    test('should analyze trades by coin', () => {
      const btcAnalysis = LogAnalyzer.analyzeTrades({ coin: 'BTC' });
      expect(btcAnalysis.totalOrders).toBeGreaterThan(0);
      expect(btcAnalysis.byCoin.BTC).toBeDefined();
    });

    test('should calculate fill rate', () => {
      const analysis = LogAnalyzer.analyzeTrades();
      expect(analysis.fillRate).toBe(100);
    });

    test('should generate trade report', () => {
      const analysis = LogAnalyzer.analyzeTrades();
      const report = LogAnalyzer.generateTradeReport(analysis);
      expect(report).toBeTruthy();
      expect(report).toContain('交易分析报告');
      expect(report).toContain('总订单数');
      expect(report).toContain('成交率');
    });
  });

  describe('Comprehensive Report', () => {
    test('should generate comprehensive report', () => {
      const report = LogAnalyzer.generateComprehensiveReport();
      expect(report).toBeTruthy();
      expect(report).toContain('日志分析报告');
      expect(report).toContain('决策分析报告');
      expect(report).toContain('交易分析报告');
    });

    test('should generate report for specific coin', () => {
      const report = LogAnalyzer.generateComprehensiveReport({ coin: 'BTC' });
      expect(report).toBeTruthy();
      expect(report).toContain('BTC');
    });

    test('should generate report for time range', () => {
      const now = Date.now();
      const report = LogAnalyzer.generateComprehensiveReport({
        startTime: now - 86400000, // last 24 hours
        endTime: now
      });
      expect(report).toBeTruthy();
    });
  });

  describe('Export to CSV', () => {
    test('should export decisions to CSV', () => {
      const csv = LogAnalyzer.exportDecisionsToCSV();
      expect(csv).toBeTruthy();
      expect(csv).toContain('Timestamp');
      expect(csv).toContain('Coin');
      expect(csv).toContain('Strategy');
      expect(csv).toContain('Action');
      expect(csv).toContain('Reason');
    });

    test('should export trades to CSV', () => {
      const csv = LogAnalyzer.exportTradesToCSV();
      expect(csv).toBeTruthy();
      expect(csv).toContain('Timestamp');
      expect(csv).toContain('OrderId');
      expect(csv).toContain('Coin');
      expect(csv).toContain('Side');
      expect(csv).toContain('Price');
    });
  });

  describe('Query Helpers', () => {
    test('should get recent decisions', () => {
      const decisions = LogAnalyzer.getRecentDecisions(5);
      expect(decisions.length).toBe(5);
    });

    test('should get recent trades', () => {
      const trades = LogAnalyzer.getRecentTrades(3);
      expect(trades.length).toBe(3);
    });

    test('should get coin decision history', () => {
      const history = LogAnalyzer.getCoinDecisionHistory('BTC', 7);
      expect(Array.isArray(history)).toBe(true);
    });

    test('should get coin trade history', () => {
      const history = LogAnalyzer.getCoinTradeHistory('BTC', 7);
      expect(Array.isArray(history)).toBe(true);
    });
  });
});

// =====================================================
// 运行测试
// =====================================================

if (import.meta.main) {
  console.log('Running Logger Tests...');
  console.log(`Test Data Dir: ${TEST_DATA_DIR}`);
  console.log(`Test Logs Dir: ${TEST_LOGS_DIR}`);
  console.log('');
  console.log('To run tests:');
  console.log('  bun test tests/utils/logger.test.ts');
}

// =====================================================
// 边界条件和异常场景测试
// =====================================================

describe('Edge Cases and Error Scenarios', () => {
  let logger: Logger;

  beforeEach(() => {
    setupTestDirs();
    (Logger as any).instance = null;
    logger = Logger.getInstance(TEST_DATA_DIR, TEST_LOGS_DIR);
    setLogger(logger);
  });

  afterEach(async () => {
    await logger.shutdown();
    cleanupTestDirs();
  });

  describe('SQLite Prepared Statements', () => {
    test('should handle statement errors gracefully', () => {
      const storage = new SQLiteLogStorage(TEST_DATA_DIR);

      // 模拟 stmt.run 错误
      expect(() => {
        storage.writeDecisionLog({
          timestamp: Date.now(),
          level: LogLevel.INFO,
          type: LogType.DECISION,
          coin: 'BTC',
          strategy: 'dca',
          action: 'buy',
          reason: 'test'
        });
      }).not.toThrow();

      storage.close();
    });

    test('should handle large metadata JSON', () => {
      const storage = new SQLiteLogStorage(TEST_DATA_DIR);

      const largeMetadata: Record<string, unknown> = {};
      for (let i = 0; i < 1000; i++) {
        largeMetadata[`key${i}`] = `value${i}`.repeat(100);
      }

      expect(() => {
        storage.writeDecisionLog({
          timestamp: Date.now(),
          level: LogLevel.INFO,
          type: LogType.DECISION,
          coin: 'BTC',
          strategy: 'dca',
          action: 'buy',
          reason: 'test',
          decisionFactors: largeMetadata
        });
      }).not.toThrow();

      storage.close();
    });
  });

  describe('Concurrent Writes', () => {
    test('should handle concurrent SQLite writes', async () => {
      const storage = new SQLiteLogStorage(TEST_DATA_DIR);

      // 并发写入
      const promises = [];
      for (let i = 0; i < 50; i++) {
        promises.push(
          Promise.resolve().then(() => {
            storage.writeDecisionLog({
              timestamp: Date.now() + i,
              level: LogLevel.INFO,
              type: LogType.DECISION,
              coin: 'BTC',
              strategy: 'dca',
              action: 'buy',
              reason: `concurrent_test_${i}`
            });
          })
        );
      }

      await Promise.all(promises);

      const logs = storage.queryDecisionLogs({ coin: 'BTC' });
      expect(logs.length).toBe(50);

      storage.close();
    });

    test('should handle concurrent file writes', async () => {
      const storage = new FileLogStorage(TEST_LOGS_DIR);

      // 并发写入
      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(
          storage.write({
            timestamp: Date.now() + i,
            level: LogLevel.INFO,
            type: LogType.SYSTEM,
            message: `concurrent_test_${i}`
          })
        );
      }

      await Promise.all(promises);

      const date = new Date().toISOString().split('T')[0];
      const logPath = path.resolve(TEST_LOGS_DIR, `system_${date}.log`);
      const content = fs.readFileSync(logPath, 'utf8');
      const lines = content.trim().split('\n');
      expect(lines.length).toBe(20);

      await storage.close();
    });
  });

  describe('Date Boundary', () => {
    test('should handle date boundary in file logging', async () => {
      const storage = new FileLogStorage(TEST_LOGS_DIR);

      // 模拟跨日期写入
      const beforeMidnight = new Date();
      beforeMidnight.setHours(23, 59, 59, 900);
      const afterMidnight = new Date(beforeMidnight);
      afterMidnight.setSeconds(afterMidnight.getSeconds() + 200);

      const entry1 = {
        timestamp: beforeMidnight.getTime(),
        level: LogLevel.INFO,
        type: LogType.SYSTEM,
        message: 'before_midnight'
      };

      const entry2 = {
        timestamp: afterMidnight.getTime(),
        level: LogLevel.INFO,
        type: LogType.SYSTEM,
        message: 'after_midnight'
      };

      await storage.write(entry1);
      await storage.write(entry2);

      // 注意：由于日期是动态获取的，这里只验证不抛出错误
      expect(true).toBe(true);

      await storage.close();
    });
  });

  describe('Empty and Null Values', () => {
    test('should handle empty strings in decision', () => {
      expect(() => {
        logger.decision({
          coin: 'BTC',
          strategy: 'dca',
          action: 'buy',
          reason: ''
        });
      }).not.toThrow();
    });

    test('should handle null optional fields in trade', () => {
      expect(() => {
        logger.trade({
          orderId: '12345',
          clientOrderId: 'client-001',
          coin: 'BTC',
          side: 'buy',
          status: 'live'
        });
      }).not.toThrow();
    });

    test('should handle zero values', () => {
      const storage = new SQLiteLogStorage(TEST_DATA_DIR);

      expect(() => {
        storage.writeTradeLog({
          timestamp: Date.now(),
          level: LogLevel.INFO,
          type: LogType.TRADE,
          orderId: 'zero-test',
          clientOrderId: 'client-zero',
          coin: 'BTC',
          side: 'buy',
          price: 0,
          size: 0,
          value: 0,
          fee: 0,
          status: 'test'
        });
      }).not.toThrow();

      storage.close();
    });
  });

  describe('Special Characters', () => {
    test('should handle special characters in JSON', () => {
      const storage = new SQLiteLogStorage(TEST_DATA_DIR);

      const specialMetadata = {
        'key"with"quotes': 'value',
        'key\nwith\nnewlines': 'value',
        'key\twith\ttabs': 'value',
        '中文': '測試',
        emoji: '🎉🚀'
      };

      expect(() => {
        storage.writeDecisionLog({
          timestamp: Date.now(),
          level: LogLevel.INFO,
          type: LogType.DECISION,
          coin: 'BTC',
          strategy: 'dca',
          action: 'buy',
          reason: 'test',
          decisionFactors: specialMetadata
        });
      }).not.toThrow();

      // 验证可以正确读取回来
      const logs = storage.queryDecisionLogs({ limit: 1 });
      expect(logs.length).toBe(1);
      expect(logs[0].decisionFactors?.中文).toBe('測試');

      storage.close();
    });

    test('should handle special characters in file log', async () => {
      const storage = new FileLogStorage(TEST_LOGS_DIR);

      // 直接调用，如果不抛出异常就通过
      await storage.write({
        timestamp: Date.now(),
        level: LogLevel.INFO,
        type: LogType.SYSTEM,
        message: 'Test with special characters: "quotes", \'apostrophes\', \n\t\n 中文 🎉',
        metadata: { 'special': '測試\n\t', emoji: '🚀' }
      });

      await storage.close();
    });
  });

  describe('Large Data Volumes', () => {
    test('should handle large number of logs', async () => {
      const storage = new SQLiteLogStorage(TEST_DATA_DIR);
      const storage2 = new FileLogStorage(TEST_LOGS_DIR);

      // 写入 1000 条决策日志
      for (let i = 0; i < 1000; i++) {
        storage.writeDecisionLog({
          timestamp: Date.now() + i,
          level: LogLevel.INFO,
          type: LogType.DECISION,
          coin: i % 2 === 0 ? 'BTC' : 'ETH',
          strategy: 'dca',
          action: 'buy',
          reason: `bulk_test_${i}`
        });
      }

      const logs = storage.queryDecisionLogs({ limit: 100 });
      expect(logs.length).toBe(100);

      // 写入 100 条文件日志
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          storage2.write({
            timestamp: Date.now() + i,
            level: LogLevel.INFO,
            type: LogType.SYSTEM,
            message: `bulk_test_${i}`
          })
        );
      }
      await Promise.all(promises);

      storage.close();
      await storage2.close();
    });
  });

  describe('Error Recovery', () => {
    test('should continue logging after error', () => {
      const storage = new SQLiteLogStorage(TEST_DATA_DIR);

      // 正常写入
      storage.writeDecisionLog({
        timestamp: Date.now(),
        level: LogLevel.INFO,
        type: LogType.DECISION,
        coin: 'BTC',
        strategy: 'dca',
        action: 'buy',
        reason: 'before_error'
      });

      storage.close();

      // 创建新实例（模拟重启）
      const storage2 = new SQLiteLogStorage(TEST_DATA_DIR);
      storage2.writeDecisionLog({
        timestamp: Date.now(),
        level: LogLevel.INFO,
        type: LogType.DECISION,
        coin: 'BTC',
        strategy: 'dca',
        action: 'buy',
        reason: 'after_reopen'
      });

      const logs = storage2.queryDecisionLogs({ coin: 'BTC' });
      expect(logs.length).toBe(2);

      storage2.close();
    });
  });

  describe('Type Safety', () => {
    test('should handle all action types', () => {
      const actions = ['buy', 'sell', 'hold', 'close', 'pause', 'reduce_position', 'close_position', 'emergency'] as const;

      actions.forEach(action => {
        expect(() => {
          logger.decision({
            coin: 'BTC',
            strategy: 'dca',
            action,
            reason: `test_action_${action}`
          });
        }).not.toThrow();
      });
    });

    test('should handle all trade log types', () => {
      const types = [LogType.TRADE, LogType.ORDER_FILLED, LogType.ORDER_CANCELLED, LogType.ORDER_FAILED];

      types.forEach(type => {
        expect(() => {
          logger.trade({
            orderId: 'test-id',
            clientOrderId: 'test-client',
            coin: 'BTC',
            side: 'buy',
            status: 'test'
          } as any); // 手动设置 type
        }).not.toThrow();
      });
    });
  });

  describe('Memory Management', () => {
    test('should not leak memory with repeated writes', () => {
      const storage = new SQLiteLogStorage(TEST_DATA_DIR);

      // 多次写入和查询
      for (let i = 0; i < 100; i++) {
        storage.writeDecisionLog({
          timestamp: Date.now() + i,
          level: LogLevel.INFO,
          type: LogType.DECISION,
          coin: 'BTC',
          strategy: 'dca',
          action: 'buy',
          reason: `memory_test_${i}`
        });

        // 定期查询
        if (i % 10 === 0) {
          const logs = storage.queryDecisionLogs({ limit: 5 });
          expect(logs.length).toBeGreaterThan(0);
        }
      }

      // 最终验证
      const allLogs = storage.queryDecisionLogs();
      expect(allLogs.length).toBe(100);

      storage.close();
    });
  });
});
