/**
 * 信号统计数据库
 *
 * 记录每个信号类型的历史表现，为决策提供统计依据
 */

import Database from 'bun:sqlite';
import { logger } from '../utils';
import type { SignalType, SignalDirection, KLineInterval } from '../market/types';

/**
 * 信号统计记录
 */
export interface SignalStatistics {
  /** 信号ID (type_coin_timeframe) */
  signalId: string;
  /** 信号类型 */
  signalType: SignalType;
  /** 币种 */
  coin: string;
  /** 时间周期 */
  timeframe: KLineInterval;
  /** 总交易次数 */
  totalTrades: number;
  /** 盈利次数 */
  winningTrades: number;
  /** 总盈利金额 */
  totalWin: number;
  /** 总亏损金额 */
  totalLoss: number;
  /** 最大单笔盈利 */
  maxWin: number;
  /** 最大单笔亏损 */
  maxLoss: number;
  /** 平均持仓时间（小时） */
  avgHoldingTime: number;
  /** 最后更新时间 */
  lastUpdated: number;
}

/**
 * 计算的统计指标
 */
export interface CalculatedStats {
  /** 胜率 */
  winRate: number;
  /** 平均盈利 */
  avgWin: number;
  /** 平均亏损 */
  avgLoss: number;
  /** 盈亏比 */
  profitFactor: number;
  /** 最大回撤 */
  maxDrawdown: number;
  /** 夏普比率（简化版） */
  sharpeRatio: number;
  /** 是否统计显著（至少30个样本） */
  isSignificant: boolean;
}

/**
 * 完整的信号统计（包含计算指标）
 */
export interface FullSignalStatistics extends SignalStatistics, CalculatedStats {}

/**
 * 交易记录
 */
export interface TradeRecord {
  /** 交易ID */
  tradeId: string;
  /** 信号ID */
  signalId: string;
  /** 币种 */
  coin: string;
  /** 动作 */
  action: 'buy' | 'sell';
  /** 入场价格 */
  entryPrice: number;
  /** 出场价格 */
  exitPrice?: number;
  /** 入场时间 */
  entryTime: number;
  /** 出场时间 */
  exitTime?: number;
  /** 盈亏 */
  pnl?: number;
  /** 持仓时间（小时） */
  holdingTime?: number;
}

/**
 * 信号统计数据库类
 */
export class SignalStatisticsDB {
  private db: Database;

  constructor(dbPath: string = ':memory:') {
    this.db = new Database(dbPath);
    this.initTables();
    logger.info('信号统计数据库初始化', { path: dbPath });
  }

  /**
   * 初始化表结构
   */
  private initTables(): void {
    // 信号统计表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS signal_statistics (
        signal_id TEXT PRIMARY KEY,
        signal_type TEXT NOT NULL,
        coin TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        total_trades INTEGER DEFAULT 0,
        winning_trades INTEGER DEFAULT 0,
        total_win REAL DEFAULT 0,
        total_loss REAL DEFAULT 0,
        max_win REAL DEFAULT 0,
        max_loss REAL DEFAULT 0,
        total_holding_time REAL DEFAULT 0,
        last_updated INTEGER,
        UNIQUE(signal_type, coin, timeframe)
      )
    `);

    // 交易历史表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS trade_history (
        trade_id TEXT PRIMARY KEY,
        signal_id TEXT NOT NULL,
        coin TEXT NOT NULL,
        action TEXT NOT NULL,
        entry_price REAL NOT NULL,
        exit_price REAL,
        entry_time INTEGER NOT NULL,
        exit_time INTEGER,
        pnl REAL,
        holding_time REAL,
        FOREIGN KEY (signal_id) REFERENCES signal_statistics(signal_id)
      )
    `);

    // 创建索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_trade_history_signal ON trade_history(signal_id);
      CREATE INDEX IF NOT EXISTS idx_trade_history_coin ON trade_history(coin);
      CREATE INDEX IF NOT EXISTS idx_trade_history_time ON trade_history(entry_time);
    `);
  }

  /**
   * 生成信号ID
   */
  private generateSignalId(signalType: SignalType, coin: string, timeframe: KLineInterval): string {
    return `${signalType}_${coin}_${timeframe}`;
  }

  /**
   * 获取信号统计
   */
  getStatistics(signalType: SignalType, coin: string, timeframe: KLineInterval): FullSignalStatistics | null {
    const signalId = this.generateSignalId(signalType, coin, timeframe);

    const stmt = this.db.query(`
      SELECT * FROM signal_statistics WHERE signal_id = ?
    `);

    const row = stmt.get(signalId) as SignalStatistics | undefined;

    if (!row) {
      return null;
    }

    return this.calculateStats(row);
  }

  /**
   * 获取所有统计
   */
  getAllStatistics(): FullSignalStatistics[] {
    const stmt = this.db.query(`SELECT * FROM signal_statistics`);
    const rows = stmt.all() as SignalStatistics[];

    return rows.map(row => this.calculateStats(row));
  }

  /**
   * 获取某币种的所有统计
   */
  getStatisticsByCoin(coin: string): FullSignalStatistics[] {
    const stmt = this.db.query(`SELECT * FROM signal_statistics WHERE coin = ?`);
    const rows = stmt.all(coin) as SignalStatistics[];

    return rows.map(row => this.calculateStats(row));
  }

  /**
   * 获取某信号类型的所有统计
   */
  getStatisticsByType(signalType: SignalType): FullSignalStatistics[] {
    const stmt = this.db.query(`SELECT * FROM signal_statistics WHERE signal_type = ?`);
    const rows = stmt.all(signalType) as SignalStatistics[];

    return rows.map(row => this.calculateStats(row));
  }

  /**
   * 计算统计指标
   */
  private calculateStats(stats: SignalStatistics): FullSignalStatistics {
    const winRate = stats.totalTrades > 0 ? stats.winningTrades / stats.totalTrades : 0;
    const avgWin = stats.winningTrades > 0 ? stats.totalWin / stats.winningTrades : 0;
    const avgLoss = stats.totalTrades - stats.winningTrades > 0
      ? stats.totalLoss / (stats.totalTrades - stats.winningTrades)
      : 0;
    const profitFactor = stats.totalLoss > 0 ? stats.totalWin / stats.totalLoss : stats.totalWin > 0 ? 999 : 0;
    const maxDrawdown = stats.maxLoss;
    const sharpeRatio = this.calculateSharpeRatio(stats);
    const isSignificant = stats.totalTrades >= 30;

    return {
      ...stats,
      winRate,
      avgWin,
      avgLoss,
      profitFactor,
      maxDrawdown,
      sharpeRatio,
      isSignificant,
    };
  }

  /**
   * 计算夏普比率（简化版）
   */
  private calculateSharpeRatio(stats: SignalStatistics): number {
    if (stats.totalTrades < 10) return 0;

    const avgReturn = (stats.totalWin - stats.totalLoss) / stats.totalTrades;
    const winRate = stats.winningTrades / stats.totalTrades;

    // 简化的标准差估算
    const variance = (stats.totalWin / (stats.winningTrades || 1) - avgReturn) ** 2 * winRate +
                     (stats.totalLoss / ((stats.totalTrades - stats.winningTrades) || 1) - avgReturn) ** 2 * (1 - winRate);
    const stdDev = Math.sqrt(variance);

    if (stdDev === 0) return 0;

    // 假设无风险利率为0
    return avgReturn / stdDev;
  }

  /**
   * 记录交易
   */
  recordTrade(trade: TradeRecord): void {
    const stmt = this.db.query(`
      INSERT INTO trade_history (
        trade_id, signal_id, coin, action, entry_price, exit_price,
        entry_time, exit_time, pnl, holding_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      trade.tradeId,
      trade.signalId,
      trade.coin,
      trade.action,
      trade.entryPrice,
      trade.exitPrice,
      trade.entryTime,
      trade.exitTime,
      trade.pnl,
      trade.holdingTime
    );

    logger.debug('记录交易', {
      tradeId: trade.tradeId,
      signalId: trade.signalId,
      pnl: trade.pnl,
    });
  }

  /**
   * 更新信号统计（当交易完成时调用）
   */
  updateStatistics(
    signalType: SignalType,
    coin: string,
    timeframe: KLineInterval,
    pnl: number,
    holdingTime: number
  ): void {
    const signalId = this.generateSignalId(signalType, coin, timeframe);

    // 获取现有统计
    const existing = this.db.query(`SELECT * FROM signal_statistics WHERE signal_id = ?`).get(signalId) as SignalStatistics | undefined;

    if (existing) {
      // 更新
      const stmt = this.db.query(`
        UPDATE signal_statistics SET
          total_trades = total_trades + 1,
          winning_trades = winning_trades + ?,
          total_win = total_win + ?,
          total_loss = total_loss + ?,
          max_win = MAX(max_win, ?),
          max_loss = MAX(max_loss, ?),
          total_holding_time = total_holding_time + ?,
          last_updated = ?
        WHERE signal_id = ?
      `);

      stmt.run(
        pnl > 0 ? 1 : 0,
        pnl > 0 ? pnl : 0,
        pnl < 0 ? Math.abs(pnl) : 0,
        pnl > 0 ? pnl : 0,
        pnl < 0 ? Math.abs(pnl) : 0,
        holdingTime,
        Date.now(),
        signalId
      );
    } else {
      // 插入新记录
      const stmt = this.db.query(`
        INSERT INTO signal_statistics (
          signal_id, signal_type, coin, timeframe, total_trades,
          winning_trades, total_win, total_loss, max_win, max_loss,
          total_holding_time, last_updated
        ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        signalId,
        signalType,
        coin,
        timeframe,
        pnl > 0 ? 1 : 0,
        pnl > 0 ? pnl : 0,
        pnl < 0 ? Math.abs(pnl) : 0,
        pnl > 0 ? pnl : 0,
        pnl < 0 ? Math.abs(pnl) : 0,
        holdingTime,
        Date.now()
      );
    }

    logger.debug('更新信号统计', {
      signalId,
      pnl,
      holdingTime,
    });
  }

  /**
   * 获取交易历史
   */
  getTradeHistory(signalId?: string, coin?: string, limit?: number): TradeRecord[] {
    let query = 'SELECT * FROM trade_history WHERE 1=1';
    const params: (string | number)[] = [];

    if (signalId) {
      query += ' AND signal_id = ?';
      params.push(signalId);
    }
    if (coin) {
      query += ' AND coin = ?';
      params.push(coin);
    }

    query += ' ORDER BY entry_time DESC';

    if (limit) {
      query += ' LIMIT ?';
      params.push(limit);
    }

    const stmt = this.db.query(query);
    return stmt.all(...params) as TradeRecord[];
  }

  /**
   * 重置所有统计（谨慎使用）
   */
  resetAll(): void {
    this.db.exec('DELETE FROM signal_statistics');
    this.db.exec('DELETE FROM trade_history');
    logger.warn('所有统计数据已重置');
  }

  /**
   * 关闭数据库
   */
  close(): void {
    this.db.close();
    logger.info('信号统计数据库已关闭');
  }
}

/**
 * 导出单例（可选）
 */
let globalStatsDB: SignalStatisticsDB | null = null;

export function getGlobalStatsDB(): SignalStatisticsDB {
  if (!globalStatsDB) {
    globalStatsDB = new SignalStatisticsDB();
  }
  return globalStatsDB;
}
