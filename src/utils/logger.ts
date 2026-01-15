/**
 * 统一日志系统
 *
 * 混合存储方案：
 * - SQLite: 决策日志、交易日志（需要查询分析）
 * - 文件: 错误日志、运行日志（追加为主）
 */

import { Database } from 'bun:sqlite';
import fs from 'fs';
import path from 'path';

// =====================================================
// 日志级别
// =====================================================

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  CRITICAL = 4
}

// =====================================================
// 日志类型
// =====================================================

export enum LogType {
  // 策略决策
  DECISION = 'decision',
  // 交易相关
  TRADE = 'trade',
  ORDER_FILLED = 'order_filled',
  ORDER_CANCELLED = 'order_cancelled',
  ORDER_FAILED = 'order_failed',
  // 风险管理
  RISK_WARNING = 'risk_warning',
  RISK_TRIGGERED = 'risk_triggered',
  STOP_LOSS = 'stop_loss',
  EMERGENCY_CLOSE = 'emergency_close',
  // 系统运行
  SYSTEM = 'system',
  ERROR = 'error',
  DEBUG = 'debug'
}

// =====================================================
// 日志条目接口
// =====================================================

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  type: LogType;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface DecisionLogEntry extends Omit<LogEntry, 'message'> {
  type: LogType.DECISION;
  message?: string;  // 可选，默认使用 reason
  coin: string;
  strategy: 'dca' | 'grid' | 'risk';
  action: 'buy' | 'sell' | 'hold' | 'close' | 'pause' | 'reduce_position' | 'close_position' | 'emergency';
  reason: string;
  marketData?: {
    price: number;
    change24h: number;
    volume24h: number;
  };
  decisionFactors?: Record<string, unknown>;
}

export interface TradeLogEntry extends Omit<LogEntry, 'message'> {
  type: LogType.TRADE | LogType.ORDER_FILLED | LogType.ORDER_CANCELLED | LogType.ORDER_FAILED;
  message?: string;  // 可选，默认使用 status
  orderId: string;
  clientOrderId: string;
  coin: string;
  side: 'buy' | 'sell';
  price?: number;
  size?: number;
  value?: number;
  fee?: number;
  status: string;
  error?: string;
  metadata?: Record<string, unknown>;
}

// =====================================================
// SQLite 日志存储
// =====================================================

export class SQLiteLogStorage {
  private db: Database;
  private dbPath: string;
  private writeLock: boolean = false;

  constructor(dataDir: string = './data') {
    this.dbPath = path.join(dataDir, 'logs.db');
    // 确保目录存在
    const dir = path.dirname(this.dbPath);
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      // 目录可能已存在，忽略错误
    }
    this.db = new Database(this.dbPath);
    this.initTables();
  }

  /**
   * 初始化数据库表
   */
  private initTables(): void {
    // 决策日志表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS decision_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        coin TEXT NOT NULL,
        strategy TEXT NOT NULL,
        action TEXT NOT NULL,
        reason TEXT NOT NULL,
        market_data TEXT,
        decision_factors TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 决策日志索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_decision_timestamp ON decision_logs(timestamp DESC)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_decision_coin ON decision_logs(coin)
    `);

    // 交易日志表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trade_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        order_id TEXT NOT NULL,
        client_order_id TEXT NOT NULL,
        coin TEXT NOT NULL,
        side TEXT NOT NULL,
        price TEXT,
        size TEXT,
        value TEXT,
        fee TEXT,
        status TEXT NOT NULL,
        error TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 交易日志索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_trade_timestamp ON trade_logs(timestamp DESC)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_trade_order_id ON trade_logs(order_id)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_trade_coin ON trade_logs(coin)
    `);

    // 风险事件日志表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS risk_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL,
        coin TEXT NOT NULL,
        event_type TEXT NOT NULL,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        trigger_value TEXT,
        threshold TEXT,
        action_taken TEXT,
        metadata TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // 风险日志索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_risk_timestamp ON risk_logs(timestamp DESC)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_risk_coin ON risk_logs(coin)
    `);
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_risk_event_type ON risk_logs(event_type)
    `);
  }

  /**
   * 写入决策日志
   */
  writeDecisionLog(entry: DecisionLogEntry): void {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO decision_logs (
          timestamp, coin, strategy, action, reason,
          market_data, decision_factors, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      try {
        stmt.run(
          entry.timestamp,
          entry.coin,
          entry.strategy,
          entry.action,
          entry.reason,
          entry.marketData ? JSON.stringify(entry.marketData) : null,
          entry.decisionFactors ? JSON.stringify(entry.decisionFactors) : null,
          entry.metadata ? JSON.stringify(entry.metadata) : null
        );
      } finally {
        stmt.finalize();
      }
    } catch (error) {
      console.error('[SQLiteLogStorage] 写入决策日志失败:', error);
      throw error;
    }
  }

  /**
   * 写入交易日志
   */
  writeTradeLog(entry: TradeLogEntry): void {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO trade_logs (
          timestamp, order_id, client_order_id, coin, side,
          price, size, value, fee, status, error, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      try {
        stmt.run(
          entry.timestamp,
          entry.orderId,
          entry.clientOrderId,
          entry.coin,
          entry.side,
          entry.price?.toString() || null,
          entry.size?.toString() || null,
          entry.value?.toString() || null,
          entry.fee?.toString() || null,
          entry.status,
          entry.error || null,
          entry.metadata ? JSON.stringify(entry.metadata) : null
        );
      } finally {
        stmt.finalize();
      }
    } catch (error) {
      console.error('[SQLiteLogStorage] 写入交易日志失败:', error);
      throw error;
    }
  }

  /**
   * 写入风险日志
   */
  writeRiskLog(
    coin: string,
    eventType: string,
    level: string,
    message: string,
    triggerValue?: unknown,
    threshold?: unknown,
    actionTaken?: string,
    metadata?: Record<string, unknown>
  ): void {
    try {
      const stmt = this.db.prepare(`
        INSERT INTO risk_logs (
          timestamp, coin, event_type, level, message,
          trigger_value, threshold, action_taken, metadata
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      try {
        stmt.run(
          Date.now(),
          coin,
          eventType,
          level,
          message,
          triggerValue !== undefined ? JSON.stringify(triggerValue) : null,
          threshold !== undefined ? JSON.stringify(threshold) : null,
          actionTaken || null,
          metadata ? JSON.stringify(metadata) : null
        );
      } finally {
        stmt.finalize();
      }
    } catch (error) {
      console.error('[SQLiteLogStorage] 写入风险日志失败:', error);
      throw error;
    }
  }

  /**
   * 查询决策日志
   */
  queryDecisionLogs(options: {
    coin?: string;
    strategy?: string;
    limit?: number;
    offset?: number;
    startTime?: number;
    endTime?: number;
  } = {}): DecisionLogEntry[] {
    let query = 'SELECT * FROM decision_logs WHERE 1=1';
    const params: unknown[] = [];

    if (options.coin) {
      query += ' AND coin = ?';
      params.push(options.coin);
    }
    if (options.strategy) {
      query += ' AND strategy = ?';
      params.push(options.strategy);
    }
    if (options.startTime) {
      query += ' AND timestamp >= ?';
      params.push(options.startTime);
    }
    if (options.endTime) {
      query += ' AND timestamp <= ?';
      params.push(options.endTime);
    }

    query += ' ORDER BY timestamp DESC';

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }
    if (options.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...(params as any[])) as unknown[];

    return (rows as any[]).map(row => this.parseDecisionLogRow(row));
  }

  /**
   * 查询交易日志
   */
  queryTradeLogs(options: {
    coin?: string;
    orderId?: string;
    limit?: number;
    offset?: number;
    startTime?: number;
    endTime?: number;
  } = {}): TradeLogEntry[] {
    let query = 'SELECT * FROM trade_logs WHERE 1=1';
    const params: unknown[] = [];

    if (options.coin) {
      query += ' AND coin = ?';
      params.push(options.coin);
    }
    if (options.orderId) {
      query += ' AND order_id = ?';
      params.push(options.orderId);
    }
    if (options.startTime) {
      query += ' AND timestamp >= ?';
      params.push(options.startTime);
    }
    if (options.endTime) {
      query += ' AND timestamp <= ?';
      params.push(options.endTime);
    }

    query += ' ORDER BY timestamp DESC, id DESC';

    if (options.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }
    if (options.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...(params as any[])) as unknown[];

    return (rows as any[]).map(row => this.parseTradeLogRow(row));
  }

  /**
   * 获取决策统计
   */
  getDecisionStats(coin?: string): {
    total: number;
    byAction: Record<string, number>;
    byStrategy: Record<string, number>;
  } {
    let query = 'SELECT action, strategy, COUNT(*) as count FROM decision_logs';
    const params: unknown[] = [];

    if (coin) {
      query += ' WHERE coin = ?';
      params.push(coin);
    }

    query += ' GROUP BY action, strategy';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...(params as any[])) as { action: string; strategy: string; count: number }[];

    const byAction: Record<string, number> = {};
    const byStrategy: Record<string, number> = {};
    let total = 0;

    for (const row of rows) {
      byAction[row.action] = (byAction[row.action] || 0) + row.count;
      byStrategy[row.strategy] = (byStrategy[row.strategy] || 0) + row.count;
      total += row.count;
    }

    return { total, byAction, byStrategy };
  }

  /**
   * 获取交易统计
   */
  getTradeStats(coin?: string): {
    totalOrders: number;
    filledOrders: number;
    cancelledOrders: number;
    failedOrders: number;
    totalValue: number;
    totalFees: number;
  } {
    let query = 'SELECT status, SUM(CAST(value AS REAL)) as value, SUM(CAST(fee AS REAL)) as fee, COUNT(*) as count FROM trade_logs';
    const params: unknown[] = [];

    if (coin) {
      query += ' WHERE coin = ?';
      params.push(coin);
    }

    query += ' GROUP BY status';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...(params as any[])) as { status: string; value: number | null; fee: number | null; count: number }[];

    const stats = {
      totalOrders: 0,
      filledOrders: 0,
      cancelledOrders: 0,
      failedOrders: 0,
      totalValue: 0,
      totalFees: 0
    };

    for (const row of rows) {
      stats.totalOrders += row.count;
      if (row.status === 'filled') {
        stats.filledOrders = row.count;
        stats.totalValue += row.value || 0;
        stats.totalFees += row.fee || 0;
      } else if (row.status === 'cancelled') {
        stats.cancelledOrders = row.count;
      } else if (row.status === 'failed') {
        stats.failedOrders = row.count;
      }
    }

    return stats;
  }

  /**
   * 清理旧日志
   */
  cleanupOldLogs(daysToKeep: number = 30): void {
    const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;

    this.db.prepare('DELETE FROM decision_logs WHERE timestamp < ?').run(cutoffTime);
    this.db.prepare('DELETE FROM trade_logs WHERE timestamp < ?').run(cutoffTime);
    this.db.prepare('DELETE FROM risk_logs WHERE timestamp < ?').run(cutoffTime);

    // 执行 VACUUM 收缩数据库
    this.db.exec('VACUUM');
  }

  /**
   * 关闭数据库连接
   */
  close(): void {
    this.db.close();
  }

  /**
   * 解析决策日志行
   */
  private parseDecisionLogRow(row: any): DecisionLogEntry {
    return {
      timestamp: row.timestamp,
      level: LogLevel.INFO,
      type: LogType.DECISION,
      message: row.reason,
      coin: row.coin,
      strategy: row.strategy,
      action: row.action,
      reason: row.reason,
      marketData: row.market_data ? JSON.parse(row.market_data) : undefined,
      decisionFactors: row.decision_factors ? JSON.parse(row.decision_factors) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    };
  }

  /**
   * 解析交易日志行
   */
  private parseTradeLogRow(row: any): TradeLogEntry {
    return {
      timestamp: row.timestamp,
      level: LogLevel.INFO,
      type: LogType.TRADE,
      message: row.status,
      orderId: row.order_id,
      clientOrderId: row.client_order_id,
      coin: row.coin,
      side: row.side,
      price: row.price ? parseFloat(row.price) : undefined,
      size: row.size ? parseFloat(row.size) : undefined,
      value: row.value ? parseFloat(row.value) : undefined,
      fee: row.fee ? parseFloat(row.fee) : undefined,
      status: row.status,
      error: row.error,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined
    };
  }
}

// =====================================================
// 文件日志存储
// =====================================================

export class FileLogStorage {
  private logsDir: string;
  private writeLocks: Map<string, Promise<void>> = new Map();

  constructor(logsDir: string = './logs') {
    // 使用绝对路径
    this.logsDir = path.resolve(logsDir);
    this.ensureLogDirectory();
  }

  /**
   * 确保日志目录存在
   */
  private ensureLogDirectory(): void {
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }
  }

  /**
   * 获取当前日期字符串
   */
  private getDateStr(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }

  /**
   * 获取日志文件路径
   */
  private getLogFilePath(type: LogType): string {
    const date = this.getDateStr();
    const filename = `${type}_${date}.log`;
    return path.join(this.logsDir, filename);
  }

  /**
   * 格式化时间戳为 YYYY-MM-DD hh:mm:ss
   */
  private formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  /**
   * 格式化日志条目
   */
  private formatEntry(entry: LogEntry | DecisionLogEntry | TradeLogEntry): string {
    const timestamp = this.formatTimestamp(entry.timestamp);
    const level = LogLevel[entry.level];
    const type = entry.type;

    // 使用 message，如果不存在则使用空字符串
    const message = entry.message ?? '';
    let log = `[${timestamp}] [${level}] [${type}] ${message}`;

    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      log += ` | ${JSON.stringify(entry.metadata)}`;
    }

    return log;
  }

  /**
   * 写入日志到文件
   */
  async write(entry: LogEntry | DecisionLogEntry | TradeLogEntry): Promise<void> {
    const logPath = this.getLogFilePath(entry.type);

    try {
      // 确保目录存在
      const dir = path.dirname(logPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // 等待之前的写入完成（简单的写入锁）
      const existingLock = this.writeLocks.get(logPath);
      if (existingLock) {
        await existingLock;
      }

      // 创建新的写入锁
      const writeLock = (async () => {
        try {
          const logLine = this.formatEntry(entry) + '\n';
          fs.appendFileSync(logPath, logLine, 'utf8');
        } finally {
          this.writeLocks.delete(logPath);
        }
      })();

      this.writeLocks.set(logPath, writeLock);
      await writeLock;
    } catch (error) {
      console.error('[FileLogStorage] 写入日志失败:', error);
      throw error;
    }
  }

  /**
   * 写入错误日志
   */
  async writeError(error: Error, context?: Record<string, unknown>): Promise<void> {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level: LogLevel.ERROR,
      type: LogType.ERROR,
      message: error.message,
      metadata: {
        name: error.name,
        stack: error.stack,
        ...context
      }
    };

    await this.write(entry);
  }

  /**
   * 读取日志文件
   */
  async readLogFile(type: LogType, date?: string): Promise<string> {
    const dateStr = date || this.getDateStr();
    const filename = `${type}_${dateStr}.log`;
    const logPath = path.join(this.logsDir, filename);

    try {
      const file = Bun.file(logPath);
      return await file.text();
    } catch {
      return '';
    }
  }

  /**
   * 清理旧日志文件
   */
  cleanupOldLogs(daysToKeep: number = 30): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    const cutoffStr = cutoffDate.toISOString().split('T')[0];

    // 删除旧日志文件
    Bun.$`find ${this.logsDir} -name "*.log" -mtime +${daysToKeep} -delete`.quiet();
  }

  /**
   * 关闭所有文件流
   */
  async close(): Promise<void> {
    // 等待所有写入完成
    const locks = Array.from(this.writeLocks.values());
    if (locks.length > 0) {
      await Promise.all(locks);
    }
    this.writeLocks.clear();
  }
}

// =====================================================
// 统一日志器
// =====================================================

export class Logger {
  private static instance: Logger | null = null;
  private sqlStorage: SQLiteLogStorage;
  private fileStorage: FileLogStorage;
  private minLevel: LogLevel = LogLevel.INFO;
  private enableConsole: boolean = true;
  private enableSQLite: boolean = true;
  private enableFile: boolean = true;

  private constructor(
    dataDir: string = './data',
    logsDir: string = './logs'
  ) {
    this.sqlStorage = new SQLiteLogStorage(dataDir);
    this.fileStorage = new FileLogStorage(logsDir);
  }

  /**
   * 获取单例实例
   */
  static getInstance(
    dataDir: string = './data',
    logsDir: string = './logs'
  ): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger(dataDir, logsDir);
    }
    return Logger.instance;
  }

  /**
   * 设置最低日志级别
   */
  setMinLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  /**
   * 启用/禁用控制台输出
   */
  setConsoleEnabled(enabled: boolean): void {
    this.enableConsole = enabled;
  }

  /**
   * 启用/禁用 SQLite 存储
   */
  setSQLiteEnabled(enabled: boolean): void {
    this.enableSQLite = enabled;
  }

  /**
   * 启用/禁用文件存储
   */
  setFileEnabled(enabled: boolean): void {
    this.enableFile = enabled;
  }

  /**
   * 格式化时间戳为 YYYY-MM-DD hh:mm:ss
   */
  private formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  // =====================================================
  // 通用日志方法
  // =====================================================

  debug(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.DEBUG, LogType.DEBUG, message, metadata);
  }

  info(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.INFO, LogType.SYSTEM, message, metadata);
  }

  warn(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.WARN, LogType.SYSTEM, message, metadata);
  }

  error(message: string, error?: Error | Record<string, unknown>): void {
    const metadata = error instanceof Error ? {
      name: error.name,
      message: error.message,
      stack: error.stack
    } : error;

    this.log(LogLevel.ERROR, LogType.ERROR, message, metadata);

    // 错误日志总是写入文件（异步，不阻塞）
    if (this.enableFile && error instanceof Error) {
      // 使用 void 标记为故意不等待的异步调用
      void this.fileStorage.writeError(error, { message, ...metadata });
    }
  }

  critical(message: string, metadata?: Record<string, unknown>): void {
    this.log(LogLevel.CRITICAL, LogType.ERROR, message, metadata);
  }

  /**
   * 内部日志方法
   */
  private log(
    level: LogLevel,
    type: LogType,
    message: string,
    metadata?: Record<string, unknown>
  ): void {
    if (level < this.minLevel) {
      return;
    }

    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      type,
      message,
      metadata
    };

    // 控制台输出
    if (this.enableConsole) {
      this.logToConsole(entry);
    }

    // SQLite 存储（仅决策和交易日志）
    if (this.enableSQLite && (type === LogType.DECISION || type === LogType.TRADE)) {
      // 由专门的方法处理
    }

    // 文件存储（异步，不阻塞）
    if (this.enableFile) {
      // 使用 void 标记为故意不等待的异步调用
      void this.fileStorage.write(entry);
    }
  }

  /**
   * 控制台输出
   */
  private logToConsole(entry: LogEntry | DecisionLogEntry | TradeLogEntry): void {
    const timestamp = this.formatTimestamp(entry.timestamp);
    const level = LogLevel[entry.level];
    const type = entry.type;

    const colors = {
      [LogLevel.DEBUG]: '\x1b[36m', // cyan
      [LogLevel.INFO]: '\x1b[32m',  // green
      [LogLevel.WARN]: '\x1b[33m',  // yellow
      [LogLevel.ERROR]: '\x1b[31m', // red
      [LogLevel.CRITICAL]: '\x1b[35m' // magenta
    };

    const reset = '\x1b[0m';
    const color = colors[entry.level];

    // 使用 message，如果不存在则使用空字符串
    const message = entry.message ?? '';
    console.log(`${color}[${timestamp}] [${level}] [${type}]${reset} ${message}`);

    if (entry.metadata && Object.keys(entry.metadata).length > 0) {
      console.log(`  ${JSON.stringify(entry.metadata, null, 2)}`);
    }
  }

  // =====================================================
  // 决策日志
  // =====================================================

  decision(entry: Omit<DecisionLogEntry, 'timestamp' | 'level' | 'type'>): void {
    const fullEntry: DecisionLogEntry = {
      timestamp: Date.now(),
      level: LogLevel.INFO,
      type: LogType.DECISION,
      ...entry
    };

    // 控制台输出
    if (this.enableConsole) {
      this.logToConsole(fullEntry);
    }

    // SQLite 存储
    if (this.enableSQLite) {
      this.sqlStorage.writeDecisionLog(fullEntry);
    }

    // 文件存储（异步，不阻塞）
    if (this.enableFile) {
      // 使用 void 标记为故意不等待的异步调用
      void this.fileStorage.write(fullEntry);
    }
  }

  // =====================================================
  // 交易日志
  // =====================================================

  trade(entry: Omit<TradeLogEntry, 'timestamp' | 'level' | 'type'>): void {
    const fullEntry: TradeLogEntry = {
      timestamp: Date.now(),
      level: LogLevel.INFO,
      type: LogType.TRADE,
      ...entry
    };

    // 控制台输出
    if (this.enableConsole) {
      this.logToConsole(fullEntry);
    }

    // SQLite 存储
    if (this.enableSQLite) {
      this.sqlStorage.writeTradeLog(fullEntry);
    }

    // 文件存储（异步，不阻塞）
    if (this.enableFile) {
      // 使用 void 标记为故意不等待的异步调用
      void this.fileStorage.write(fullEntry);
    }
  }

  // =====================================================
  // 风险日志
  // =====================================================

  risk(
    coin: string,
    eventType: string,
    level: string,
    message: string,
    triggerValue?: unknown,
    threshold?: unknown,
    actionTaken?: string,
    metadata?: Record<string, unknown>
  ): void {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level: LogLevel.WARN,
      type: LogType.RISK_WARNING,
      message: `[${coin}] ${message}`,
      metadata: {
        eventType,
        triggerValue,
        threshold,
        actionTaken,
        ...metadata
      }
    };

    // 控制台输出
    if (this.enableConsole) {
      this.logToConsole(entry);
    }

    // SQLite 存储
    if (this.enableSQLite) {
      this.sqlStorage.writeRiskLog(coin, eventType, level, message, triggerValue, threshold, actionTaken, metadata);
    }

    // 文件存储（异步，不阻塞）
    if (this.enableFile) {
      // 使用 void 标记为故意不等待的异步调用
      void this.fileStorage.write(entry);
    }
  }

  // =====================================================
  // 查询方法
  // =====================================================

  /**
   * 查询决策日志
   */
  getDecisions(options?: Parameters<SQLiteLogStorage['queryDecisionLogs']>[0]): DecisionLogEntry[] {
    return this.sqlStorage.queryDecisionLogs(options);
  }

  /**
   * 查询交易日志
   */
  getTrades(options?: Parameters<SQLiteLogStorage['queryTradeLogs']>[0]): TradeLogEntry[] {
    return this.sqlStorage.queryTradeLogs(options);
  }

  /**
   * 获取决策统计
   */
  getDecisionStats(coin?: string): ReturnType<SQLiteLogStorage['getDecisionStats']> {
    return this.sqlStorage.getDecisionStats(coin);
  }

  /**
   * 获取交易统计
   */
  getTradeStats(coin?: string): ReturnType<SQLiteLogStorage['getTradeStats']> {
    return this.sqlStorage.getTradeStats(coin);
  }

  // =====================================================
  // 清理和维护
  // =====================================================

  /**
   * 清理旧日志
   */
  cleanup(daysToKeep: number = 30): void {
    this.sqlStorage.cleanupOldLogs(daysToKeep);
    this.fileStorage.cleanupOldLogs(daysToKeep);
    this.info(`已清理 ${daysToKeep} 天前的日志`);
  }

  /**
   * 关闭日志系统
   */
  async shutdown(): Promise<void> {
    this.sqlStorage.close();
    await this.fileStorage.close();
    this.info('日志系统已关闭');
  }

  // =====================================================
  // 报告生成
  // =====================================================

  /**
   * 生成日志报告
   */
  generateReport(): string {
    const decisionStats = this.getDecisionStats();
    const tradeStats = this.getTradeStats();

    return `
📊 日志系统报告
${'='.repeat(60)}

决策统计:
  总决策数: ${decisionStats.total}
  按操作类型: ${JSON.stringify(decisionStats.byAction)}
  按策略类型: ${JSON.stringify(decisionStats.byStrategy)}

交易统计:
  总订单数: ${tradeStats.totalOrders}
  已成交: ${tradeStats.filledOrders}
  已取消: ${tradeStats.cancelledOrders}
  失败: ${tradeStats.failedOrders}
  总交易额: ${tradeStats.totalValue.toFixed(2)} USDT
  总手续费: ${tradeStats.totalFees.toFixed(4)} USDT
    `.trim();
  }
}

// =====================================================
// 导出单例获取函数
// =====================================================

export const logger = Logger.getInstance();
