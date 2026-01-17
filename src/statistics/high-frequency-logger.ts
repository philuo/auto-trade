/**
 * 高频交易数据记录系统
 *
 * 针对秒级高频交易优化：
 * - 批量写入机制（减少 I/O 次数）
 * - 原始信号日志（每个信号都记录）
 * - 指标快照（时间序列数据）
 * - 时间窗口汇总（按分钟/小时/天聚合）
 * - 学习分析机制（从历史数据中学习）
 */

import Database from 'bun:sqlite';
import { logger } from '../utils';
import type { TechnicalSignal, KLineInterval, CandleData } from '../market/types';

// =====================================================
// 数据模型
// =====================================================

/**
 * 原始信号日志
 */
export interface RawSignalLog {
  /** 信号唯一ID */
  signalId: string;
  /** 币种 */
  coin: string;
  /** K线周期 */
  timeframe: KLineInterval;
  /** 信号类型 */
  signalType: string;
  /** 信号方向 */
  direction: 'bullish' | 'bearish' | 'neutral';
  /** 信号强度 (0-100) */
  strength: number;
  /** 置信度 (0-1) */
  confidence: number;
  /** 触发价格 */
  price: number;
  /** K线收盘时间 */
  klineCloseTime: number;
  /** 生成时间 */
  timestamp: number;
  /** 相关指标值 */
  indicators: Record<string, number>;
  /** 市场状态 */
  marketState?: {
    trend: string;
    volatility: string;
    momentum: string;
  };
  /** 是否执行 */
  executed: boolean;
  /** 执行后结果（如果已执行） */
  result?: {
    entryPrice: number;
    exitPrice?: number;
    pnl?: number;
    holdingTime?: number;
  };
}

/**
 * 指标快照（时间序列数据）
 */
export interface IndicatorSnapshot {
  /** 快照ID */
  snapshotId: string;
  /** 币种 */
  coin: string;
  /** K线周期 */
  timeframe: KLineInterval;
  /** K线收盘时间 */
  klineCloseTime: number;
  /** 记录时间 */
  timestamp: number;
  /** 当前价格 */
  price: number;

  // 趋势指标
  ma7: number;
  ma25: number;
  ma99: number;
  ema7?: number;
  ema25?: number;

  // 动量指标
  rsi: number;
  rsiMA?: number;

  // MACD
  macd?: number;
  macdSignal?: number;
  macdHistogram?: number;

  // 布林带
  bbUpper?: number;
  bbMiddle?: number;
  bbLower?: number;
  bbBandwidth?: number;

  // ADX
  adx?: number;
  plusDI?: number;
  minusDI?: number;

  // ATR
  atr?: number;
  atrRatio?: number;

  // 成交量
  volume: number;
  volumeMA20: number;
  volumeRatio: number;

  // KDJ
  kdjK?: number;
  kdjD?: number;
  kdjJ?: number;

  // CCI
  cci?: number;

  // WR
  wr?: number;

  // PSY
  psy?: number;

  // 市场状态分类
  marketTrend: 'uptrend' | 'downtrend' | 'sideways';
  marketVolatility: 'low' | 'normal' | 'high' | 'extreme';
  marketMomentum: 'strong' | 'weak' | 'neutral';
}

/**
 * 时间窗口汇总
 */
export interface TimeWindowSummary {
  /** 汇总ID */
  summaryId: string;
  /** 币种 */
  coin: string;
  /** K线周期 */
  timeframe: KLineInterval;
  /** 窗口开始时间 */
  windowStart: number;
  /** 窗口结束时间 */
  windowEnd: number;
  /** 窗口类型 (1m, 5m, 1h, 1d) */
  windowType: string;

  // 信号统计
  totalSignals: number;
  bullishSignals: number;
  bearishSignals: number;
  neutralSignals: number;

  // 按类型统计
  signalsByType: Record<string, number>;

  // 价格统计
  priceOpen: number;
  priceHigh: number;
  priceLow: number;
  priceClose: number;
  priceChange: number;
  priceChangePercent: number;

  // 指标统计
  avgRSI: number;
  avgVolume: number;
  avgStrength: number;
  avgConfidence: number;

  // 市场状态
  dominantMarketTrend: string;
  dominantVolatility: string;

  // 执行统计
  executedSignals: number;
  executionRate: number;
}

// =====================================================
// 高频数据记录器
// =====================================================

export class HighFrequencyDataLogger {
  private db: Database;
  private dbPath: string;

  // 批量写入缓冲区
  private signalBuffer: RawSignalLog[] = [];
  private indicatorBuffer: IndicatorSnapshot[] = [];

  // 配置
  private readonly SIGNAL_BUFFER_SIZE = 100; // 缓冲100条信号后批量写入
  private readonly INDICATOR_BUFFER_SIZE = 500; // 缓冲500条指标后批量写入
  private readonly FLUSH_INTERVAL = 5000; // 5秒强制刷新

  private flushTimer?: NodeJS.Timeout;

  constructor(dbPath: string = './data/high_frequency.db') {
    this.dbPath = dbPath;
    this.db = new Database(this.dbPath);

    // 优化 SQLite 性能
    this.db.exec('PRAGMA journal_mode = WAL'); // 写前日志模式
    this.db.exec('PRAGMA synchronous = NORMAL'); // 正常同步
    this.db.exec('PRAGMA cache_size = -64000'); // 64MB 缓存
    this.db.exec('PRAGMA temp_store = MEMORY'); // 临时表在内存中

    this.initTables();
    this.startFlushTimer();

    logger.info('高频数据记录器初始化', { path: dbPath });
  }

  /**
   * 初始化表结构
   */
  private initTables(): void {
    // 1. 原始信号日志表（分区存储，按月分区）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS raw_signal_logs (
        signal_id TEXT PRIMARY KEY,
        coin TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        signal_type TEXT NOT NULL,
        direction TEXT NOT NULL,
        strength REAL NOT NULL,
        confidence REAL NOT NULL,
        price REAL NOT NULL,
        kline_close_time INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        indicators TEXT,
        market_state TEXT,
        executed INTEGER DEFAULT 0,
        result TEXT
      )
    `);

    // 信号日志索引（高频查询优化）
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_signal_coin_time ON raw_signal_logs(coin, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_signal_timeframe ON raw_signal_logs(timeframe, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_signal_kline_time ON raw_signal_logs(kline_close_time);
      CREATE INDEX IF NOT EXISTS idx_signal_executed ON raw_signal_logs(executed);
    `);

    // 2. 指标快照表（时间序列数据）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS indicator_snapshots (
        snapshot_id TEXT PRIMARY KEY,
        coin TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        kline_close_time INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        price REAL NOT NULL,

        -- 趋势指标
        ma7 REAL NOT NULL,
        ma25 REAL NOT NULL,
        ma99 REAL NOT NULL,
        ema7 REAL,
        ema25 REAL,

        -- 动量指标
        rsi REAL NOT NULL,
        rsi_ma REAL,

        -- MACD
        macd REAL,
        macd_signal REAL,
        macd_histogram REAL,

        -- 布林带
        bb_upper REAL,
        bb_middle REAL,
        bb_lower REAL,
        bb_bandwidth REAL,

        -- ADX
        adx REAL,
        plus_di REAL,
        minus_di REAL,

        -- ATR
        atr REAL,
        atr_ratio REAL,

        -- 成交量
        volume REAL NOT NULL,
        volume_ma20 REAL NOT NULL,
        volume_ratio REAL NOT NULL,

        -- KDJ
        kdj_k REAL,
        kdj_d REAL,
        kdj_j REAL,

        -- CCI
        cci REAL,

        -- WR
        wr REAL,

        -- PSY
        psy REAL,

        -- 市场状态
        market_trend TEXT NOT NULL,
        market_volatility TEXT NOT NULL,
        market_momentum TEXT NOT NULL
      )
    `);

    // 指标快照索引（时间序列查询优化）
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_snapshot_coin_time ON indicator_snapshots(coin, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_snapshot_timeframe_time ON indicator_snapshots(timeframe, kline_close_time DESC);
      CREATE INDEX IF NOT EXISTS idx_snapshot_price ON indicator_snapshots(price);
    `);

    // 3. 时间窗口汇总表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS time_window_summaries (
        summary_id TEXT PRIMARY KEY,
        coin TEXT NOT NULL,
        timeframe TEXT NOT NULL,
        window_start INTEGER NOT NULL,
        window_end INTEGER NOT NULL,
        window_type TEXT NOT NULL,

        -- 信号统计
        total_signals INTEGER DEFAULT 0,
        bullish_signals INTEGER DEFAULT 0,
        bearish_signals INTEGER DEFAULT 0,
        neutral_signals INTEGER DEFAULT 0,
        signals_by_type TEXT,

        -- 价格统计
        price_open REAL NOT NULL,
        price_high REAL NOT NULL,
        price_low REAL NOT NULL,
        price_close REAL NOT NULL,
        price_change REAL NOT NULL,
        price_change_percent REAL NOT NULL,

        -- 指标统计
        avg_rsi REAL NOT NULL,
        avg_volume REAL NOT NULL,
        avg_strength REAL NOT NULL,
        avg_confidence REAL NOT NULL,

        -- 市场状态
        dominant_market_trend TEXT NOT NULL,
        dominant_volatility TEXT NOT NULL,

        -- 执行统计
        executed_signals INTEGER DEFAULT 0,
        execution_rate REAL DEFAULT 0,

        UNIQUE(coin, timeframe, window_start, window_type)
      )
    `);

    // 汇总表索引
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_summary_coin_time ON time_window_summaries(coin, window_start DESC);
      CREATE INDEX IF NOT EXISTS idx_summary_type ON time_window_summaries(window_type, window_start DESC);
    `);
  }

  // =====================================================
  // 信号记录（批量写入）
  // =====================================================

  /**
   * 记录单个信号（添加到缓冲区）
   */
  logSignal(signal: Partial<TechnicalSignal> & {
    coin: string;
    timeframe: KLineInterval;
    klineCloseTime: number;
    indicators?: Record<string, number>;
    marketState?: RawSignalLog['marketState'];
  }): void {
    const log: RawSignalLog = {
      signalId: signal.id || `${signal.type}_${signal.coin}_${signal.timeframe}_${signal.timestamp}`,
      coin: signal.coin,
      timeframe: signal.timeframe,
      signalType: signal.type || 'UNKNOWN',
      direction: signal.direction === 'bullish' ? 'bullish' : signal.direction === 'bearish' ? 'bearish' : 'neutral',
      strength: (signal.strength || 0) * 100, // 转换为0-100范围
      confidence: signal.strength || 0, // 使用strength作为confidence
      price: signal.price || 0,
      klineCloseTime: signal.klineCloseTime,
      timestamp: signal.timestamp || Date.now(),
      indicators: signal.indicators || {},
      marketState: signal.marketState,
      executed: false,
    };

    this.signalBuffer.push(log);

    // 缓冲区满时批量写入
    if (this.signalBuffer.length >= this.SIGNAL_BUFFER_SIZE) {
      this.flushSignalBuffer();
    }
  }

  /**
   * 批量写入信号缓冲区
   */
  private flushSignalBuffer(): void {
    if (this.signalBuffer.length === 0) return;

    const startTime = Date.now();

    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO raw_signal_logs (
          signal_id, coin, timeframe, signal_type, direction,
          strength, confidence, price, kline_close_time, timestamp,
          indicators, market_state, executed, result
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const transaction = this.db.transaction(() => {
        for (const log of this.signalBuffer) {
          stmt.run(
            log.signalId,
            log.coin,
            log.timeframe,
            log.signalType,
            log.direction,
            log.strength,
            log.confidence,
            log.price,
            log.klineCloseTime,
            log.timestamp,
            JSON.stringify(log.indicators),
            log.marketState ? JSON.stringify(log.marketState) : null,
            log.executed ? 1 : 0,
            log.result ? JSON.stringify(log.result) : null
          );
        }
      });

      transaction();

      const count = this.signalBuffer.length;
      this.signalBuffer = [];

      logger.debug('批量写入信号日志', {
        count,
        duration: Date.now() - startTime,
      });

    } catch (error) {
      logger.error('批量写入信号失败', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  // =====================================================
  // 指标快照记录（批量写入）
  // =====================================================

  /**
   * 记录指标快照（添加到缓冲区）
   */
  logIndicatorSnapshot(snapshot: Omit<IndicatorSnapshot, 'snapshotId' | 'timestamp'>): void {
    const log: IndicatorSnapshot = {
      snapshotId: `${snapshot.coin}_${snapshot.timeframe}_${snapshot.klineCloseTime}`,
      timestamp: Date.now(),
      ...snapshot,
    };

    this.indicatorBuffer.push(log);

    // 缓冲区满时批量写入
    if (this.indicatorBuffer.length >= this.INDICATOR_BUFFER_SIZE) {
      this.flushIndicatorBuffer();
    }
  }

  /**
   * 批量写入指标缓冲区
   */
  private flushIndicatorBuffer(): void {
    if (this.indicatorBuffer.length === 0) return;

    const startTime = Date.now();

    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO indicator_snapshots (
          snapshot_id, coin, timeframe, kline_close_time, timestamp, price,
          ma7, ma25, ma99, ema7, ema25,
          rsi, rsi_ma,
          macd, macd_signal, macd_histogram,
          bb_upper, bb_middle, bb_lower, bb_bandwidth,
          adx, plus_di, minus_di,
          atr, atr_ratio,
          volume, volume_ma20, volume_ratio,
          kdj_k, kdj_d, kdj_j,
          cci, wr, psy,
          market_trend, market_volatility, market_momentum
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const transaction = this.db.transaction(() => {
        for (const log of this.indicatorBuffer) {
          stmt.run(
            log.snapshotId,
            log.coin,
            log.timeframe,
            log.klineCloseTime,
            log.timestamp,
            log.price,
            log.ma7,
            log.ma25,
            log.ma99,
            log.ema7,
            log.ema25,
            log.rsi,
            log.rsiMA,
            log.macd,
            log.macdSignal,
            log.macdHistogram,
            log.bbUpper,
            log.bbMiddle,
            log.bbLower,
            log.bbBandwidth,
            log.adx,
            log.plusDI,
            log.minusDI,
            log.atr,
            log.atrRatio,
            log.volume,
            log.volumeMA20,
            log.volumeRatio,
            log.kdjK,
            log.kdjD,
            log.kdjJ,
            log.cci,
            log.wr,
            log.psy,
            log.marketTrend,
            log.marketVolatility,
            log.marketMomentum
          );
        }
      });

      transaction();

      const count = this.indicatorBuffer.length;
      this.indicatorBuffer = [];

      logger.debug('批量写入指标快照', {
        count,
        duration: Date.now() - startTime,
      });

    } catch (error) {
      logger.error('批量写入指标失败', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  // =====================================================
  // 查询方法
  // =====================================================

  /**
   * 查询信号日志
   */
  querySignals(options: {
    coin?: string;
    timeframe?: KLineInterval;
    signalType?: string;
    direction?: string;
    executed?: boolean;
    startTime?: number;
    endTime?: number;
    limit?: number;
  } = {}): RawSignalLog[] {
    let query = 'SELECT * FROM raw_signal_logs WHERE 1=1';
    const params: (string | number | boolean)[] = [];

    if (options.coin) {
      query += ' AND coin = ?';
      params.push(options.coin);
    }
    if (options.timeframe) {
      query += ' AND timeframe = ?';
      params.push(options.timeframe);
    }
    if (options.signalType) {
      query += ' AND signal_type = ?';
      params.push(options.signalType);
    }
    if (options.direction) {
      query += ' AND direction = ?';
      params.push(options.direction);
    }
    if (options.executed !== undefined) {
      query += ' AND executed = ?';
      params.push(options.executed ? 1 : 0);
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

    const stmt = this.db.query(query);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => ({
      signalId: row.signal_id,
      coin: row.coin,
      timeframe: row.timeframe,
      signalType: row.signal_type,
      direction: row.direction,
      strength: row.strength,
      confidence: row.confidence,
      price: row.price,
      klineCloseTime: row.kline_close_time,
      timestamp: row.timestamp,
      indicators: row.indicators ? JSON.parse(row.indicators) : {},
      marketState: row.market_state ? JSON.parse(row.market_state) : undefined,
      executed: row.executed === 1,
      result: row.result ? JSON.parse(row.result) : undefined,
    }));
  }

  /**
   * 查询指标快照
   */
  queryIndicatorSnapshots(options: {
    coin?: string;
    timeframe?: KLineInterval;
    startTime?: number;
    endTime?: number;
    limit?: number;
  } = {}): IndicatorSnapshot[] {
    let query = 'SELECT * FROM indicator_snapshots WHERE 1=1';
    const params: (string | number)[] = [];

    if (options.coin) {
      query += ' AND coin = ?';
      params.push(options.coin);
    }
    if (options.timeframe) {
      query += ' AND timeframe = ?';
      params.push(options.timeframe);
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

    const stmt = this.db.query(query);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => ({
      snapshotId: row.snapshot_id,
      coin: row.coin,
      timeframe: row.timeframe,
      klineCloseTime: row.kline_close_time,
      timestamp: row.timestamp,
      price: row.price,
      ma7: row.ma7,
      ma25: row.ma25,
      ma99: row.ma99,
      ema7: row.ema7,
      ema25: row.ema25,
      rsi: row.rsi,
      rsiMA: row.rsi_ma,
      macd: row.macd,
      macdSignal: row.macd_signal,
      macdHistogram: row.macd_histogram,
      bbUpper: row.bb_upper,
      bbMiddle: row.bb_middle,
      bbLower: row.bb_lower,
      bbBandwidth: row.bb_bandwidth,
      adx: row.adx,
      plusDI: row.plus_di,
      minusDI: row.minus_di,
      atr: row.atr,
      atrRatio: row.atr_ratio,
      volume: row.volume,
      volumeMA20: row.volume_ma20,
      volumeRatio: row.volume_ratio,
      kdjK: row.kdj_k,
      kdjD: row.kdj_d,
      kdjJ: row.kdj_j,
      cci: row.cci,
      wr: row.wr,
      psy: row.psy,
      marketTrend: row.market_trend,
      marketVolatility: row.market_volatility,
      marketMomentum: row.market_momentum,
    }));
  }

  // =====================================================
  // 时间窗口汇总
  // =====================================================

  /**
   * 生成时间窗口汇总（后台任务）
   */
  generateTimeWindowSummaries(): void {
    // 获取所有币种和时间周期组合
    const combinations = this.db.query(`
      SELECT DISTINCT coin, timeframe FROM raw_signal_logs
    `).all() as { coin: string; timeframe: string }[];

    for (const combo of combinations) {
      this.generateSummariesForCoin(combo.coin, combo.timeframe as KLineInterval);
    }
  }

  /**
   * 为特定币种生成汇总
   */
  private generateSummariesForCoin(coin: string, timeframe: KLineInterval): void {
    // 1分钟、5分钟、1小时、1天汇总
    const windows = [
      { type: '1m', size: 60 * 1000 },
      { type: '5m', size: 5 * 60 * 1000 },
      { type: '1h', size: 60 * 60 * 1000 },
      { type: '1d', size: 24 * 60 * 60 * 1000 },
    ];

    for (const window of windows) {
      this.generateWindowSummary(coin, timeframe, window.type, window.size);
    }
  }

  /**
   * 生成单个时间窗口的汇总
   */
  private generateWindowSummary(
    coin: string,
    timeframe: KLineInterval,
    windowType: string,
    windowSize: number
  ): void {
    // 获取最近的未汇总数据
    const lastSummary = this.db.query(`
      SELECT MAX(window_end) as last_end FROM time_window_summaries
      WHERE coin = ? AND timeframe = ? AND window_type = ?
    `).get(coin, timeframe, windowType) as { last_end: number | null } | null;

    const startTime = lastSummary?.last_end || (Date.now() - windowSize);
    const endTime = startTime + windowSize;

    // 查询该窗口内的信号
    const signals = this.querySignals({
      coin,
      timeframe,
      startTime,
      endTime,
    });

    if (signals.length === 0) return;

    // 查询该窗口内的指标快照
    const snapshots = this.queryIndicatorSnapshots({
      coin,
      timeframe,
      startTime,
      endTime,
    });

    // 计算汇总数据
    const summary = this.calculateWindowSummary(
      coin,
      timeframe,
      startTime,
      endTime,
      windowType,
      signals,
      snapshots
    );

    // 保存汇总
    this.saveSummary(summary);
  }

  /**
   * 计算时间窗口汇总
   */
  private calculateWindowSummary(
    coin: string,
    timeframe: KLineInterval,
    windowStart: number,
    windowEnd: number,
    windowType: string,
    signals: RawSignalLog[],
    snapshots: IndicatorSnapshot[]
  ): Omit<TimeWindowSummary, 'summaryId'> {
    // 信号统计
    const totalSignals = signals.length;
    const bullishSignals = signals.filter(s => s.direction === 'bullish').length;
    const bearishSignals = signals.filter(s => s.direction === 'bearish').length;
    const neutralSignals = signals.filter(s => s.direction === 'neutral').length;

    const signalsByType: Record<string, number> = {};
    for (const signal of signals) {
      signalsByType[signal.signalType] = (signalsByType[signal.signalType] || 0) + 1;
    }

    // 价格统计（从指标快照中获取）
    const prices = snapshots.map(s => s.price);
    const priceOpen = prices[0] || 0;
    const priceClose = prices[prices.length - 1] || 0;
    const priceHigh = Math.max(...prices, 0);
    const priceLow = Math.min(...prices, 0);
    const priceChange = priceClose - priceOpen;
    const priceChangePercent = priceOpen > 0 ? (priceChange / priceOpen) * 100 : 0;

    // 指标统计
    const avgRSI = snapshots.length > 0
      ? snapshots.reduce((sum, s) => sum + s.rsi, 0) / snapshots.length
      : 50;
    const avgVolume = snapshots.length > 0
      ? snapshots.reduce((sum, s) => sum + s.volume, 0) / snapshots.length
      : 0;
    const avgStrength = signals.length > 0
      ? signals.reduce((sum, s) => sum + s.strength, 0) / signals.length
      : 0;
    const avgConfidence = signals.length > 0
      ? signals.reduce((sum, s) => sum + s.confidence, 0) / signals.length
      : 0;

    // 市场状态（取最常见的状态）
    const trends = snapshots.map(s => s.marketTrend);
    const dominantMarketTrend = this.getMostFrequent(trends);

    const volatilities = snapshots.map(s => s.marketVolatility);
    const dominantVolatility = this.getMostFrequent(volatilities);

    // 执行统计
    const executedSignals = signals.filter(s => s.executed).length;
    const executionRate = totalSignals > 0 ? executedSignals / totalSignals : 0;

    return {
      coin,
      timeframe,
      windowStart,
      windowEnd,
      windowType,
      totalSignals,
      bullishSignals,
      bearishSignals,
      neutralSignals,
      signalsByType,
      priceOpen,
      priceHigh,
      priceLow,
      priceClose,
      priceChange,
      priceChangePercent,
      avgRSI,
      avgVolume,
      avgStrength,
      avgConfidence,
      dominantMarketTrend,
      dominantVolatility,
      executedSignals,
      executionRate,
    };
  }

  /**
   * 获取最频繁的值
   */
  private getMostFrequent(arr: string[]): string {
    const counts: Record<string, number> = {};
    for (const item of arr) {
      counts[item] = (counts[item] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'unknown';
  }

  /**
   * 保存汇总
   */
  private saveSummary(summary: Omit<TimeWindowSummary, 'summaryId'>): void {
    const summaryId = `${summary.coin}_${summary.timeframe}_${summary.windowType}_${summary.windowStart}`;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO time_window_summaries (
        summary_id, coin, timeframe, window_start, window_end, window_type,
        total_signals, bullish_signals, bearish_signals, neutral_signals, signals_by_type,
        price_open, price_high, price_low, price_close, price_change, price_change_percent,
        avg_rsi, avg_volume, avg_strength, avg_confidence,
        dominant_market_trend, dominant_volatility,
        executed_signals, execution_rate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      summaryId,
      summary.coin,
      summary.timeframe,
      summary.windowStart,
      summary.windowEnd,
      summary.windowType,
      summary.totalSignals,
      summary.bullishSignals,
      summary.bearishSignals,
      summary.neutralSignals,
      JSON.stringify(summary.signalsByType),
      summary.priceOpen,
      summary.priceHigh,
      summary.priceLow,
      summary.priceClose,
      summary.priceChange,
      summary.priceChangePercent,
      summary.avgRSI,
      summary.avgVolume,
      summary.avgStrength,
      summary.avgConfidence,
      summary.dominantMarketTrend,
      summary.dominantVolatility,
      summary.executedSignals,
      summary.executionRate
    );
  }

  // =====================================================
  // 学习和分析机制
  // =====================================================

  /**
   * 分析信号表现
   */
  analyzeSignalPerformance(signalType: string, coin?: string): {
    totalSignals: number;
    executedSignals: number;
    winRate: number;
    avgPnL: number;
    avgHoldingTime: number;
    bestMarketCondition: string;
    worstMarketCondition: string;
  } {
    let query = 'SELECT * FROM raw_signal_logs WHERE signal_type = ? AND executed = 1';
    const params: (string | number)[] = [signalType];

    if (coin) {
      query += ' AND coin = ?';
      params.push(coin);
    }

    const stmt = this.db.query(query);
    const signals = stmt.all(...params) as any[];

    const totalSignals = signals.length;
    const executedSignals = signals.filter(s => s.executed).length;

    // 计算盈亏
    const results = signals
      .filter(s => s.result)
      .map(s => JSON.parse(s.result));

    const winningTrades = results.filter(r => r.pnl > 0);
    const winRate = results.length > 0 ? winningTrades.length / results.length : 0;

    const avgPnL = results.length > 0
      ? results.reduce((sum, r) => sum + (r.pnl || 0), 0) / results.length
      : 0;

    const avgHoldingTime = results.length > 0
      ? results.reduce((sum, r) => sum + (r.holdingTime || 0), 0) / results.length
      : 0;

    // 分析市场条件影响
    const byMarketCondition: Record<string, { pnl: number; count: number }> = {};
    for (const signal of signals) {
      const marketState = signal.market_state ? JSON.parse(signal.market_state) : null;
      const condition = marketState?.trend || 'unknown';
      const result = signal.result ? JSON.parse(signal.result) : null;

      if (!byMarketCondition[condition]) {
        byMarketCondition[condition] = { pnl: 0, count: 0 };
      }
      if (result?.pnl) {
        byMarketCondition[condition].pnl += result.pnl;
        byMarketCondition[condition].count++;
      }
    }

    const conditions = Object.entries(byMarketCondition)
      .map(([cond, data]) => ({ condition: cond, avgPnL: data.count > 0 ? data.pnl / data.count : 0 }))
      .sort((a, b) => b.avgPnL - a.avgPnL);

    return {
      totalSignals,
      executedSignals,
      winRate,
      avgPnL,
      avgHoldingTime,
      bestMarketCondition: conditions[0]?.condition || 'unknown',
      worstMarketCondition: conditions[conditions.length - 1]?.condition || 'unknown',
    };
  }

  /**
   * 获取信号建议
   */
  getSignalRecommendations(signalType: string, coin: string, currentMarketState: {
    trend: string;
    volatility: string;
    momentum: string;
  }): {
    shouldExecute: boolean;
    confidence: number;
    reason: string;
    historicalWinRate?: number;
    expectedPnL?: number;
  } {
    const analysis = this.analyzeSignalPerformance(signalType, coin);

    // 基于历史数据给出建议
    if (analysis.totalSignals < 10) {
      return {
        shouldExecute: false,
        confidence: 0,
        reason: '数据样本不足，需要至少10个历史信号',
      };
    }

    // 检查当前市场条件是否适合
    const bestCondition = analysis.bestMarketCondition;
    const worstCondition = analysis.worstMarketCondition;

    if (currentMarketState.trend === worstCondition) {
      return {
        shouldExecute: false,
        confidence: 0.2,
        reason: `当前市场条件 (${currentMarketState.trend}) 下该信号表现较差`,
        historicalWinRate: analysis.winRate,
        expectedPnL: analysis.avgPnL,
      };
    }

    if (currentMarketState.trend === bestCondition) {
      return {
        shouldExecute: true,
        confidence: Math.min(0.9, analysis.winRate + 0.1),
        reason: `当前市场条件 (${currentMarketState.trend}) 下该信号表现良好`,
        historicalWinRate: analysis.winRate,
        expectedPnL: analysis.avgPnL,
      };
    }

    // 中等情况
    return {
      shouldExecute: analysis.winRate > 0.5,
      confidence: analysis.winRate,
      reason: `基于历史胜率 ${analysis.winRate.toFixed(2)} 判断`,
      historicalWinRate: analysis.winRate,
      expectedPnL: analysis.avgPnL,
    };
  }

  // =====================================================
  // 维护和清理
  // =====================================================

  /**
   * 启动定期刷新计时器
   */
  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flushSignalBuffer();
      this.flushIndicatorBuffer();
    }, this.FLUSH_INTERVAL);
  }

  /**
   * 手动刷新缓冲区
   */
  flush(): void {
    this.flushSignalBuffer();
    this.flushIndicatorBuffer();
  }

  /**
   * 清理旧数据
   */
  cleanup(daysToKeep: number = 30): void {
    const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;

    // 清理原始信号日志（保留汇总数据）
    this.db.prepare('DELETE FROM raw_signal_logs WHERE timestamp < ? AND executed = 1').run(cutoffTime);

    // 清理指标快照
    this.db.prepare('DELETE FROM indicator_snapshots WHERE timestamp < ?').run(cutoffTime);

    // 汇总数据保留更长时间
    this.db.prepare('DELETE FROM time_window_summaries WHERE window_end < ?').run(
      Date.now() - 90 * 24 * 60 * 60 * 1000
    );

    // 执行 VACUUM
    this.db.exec('VACUUM');

    logger.info('高频数据清理完成', { daysToKeep });
  }

  /**
   * 获取统计信息
   */
  getStats(): {
    totalSignals: number;
    totalSnapshots: number;
    totalSummaries: number;
    bufferSize: { signals: number; indicators: number };
  } {
    const totalSignals = this.db.query('SELECT COUNT(*) as count FROM raw_signal_logs').get() as { count: number };
    const totalSnapshots = this.db.query('SELECT COUNT(*) as count FROM indicator_snapshots').get() as { count: number };
    const totalSummaries = this.db.query('SELECT COUNT(*) as count FROM time_window_summaries').get() as { count: number };

    return {
      totalSignals: totalSignals.count,
      totalSnapshots: totalSnapshots.count,
      totalSummaries: totalSummaries.count,
      bufferSize: {
        signals: this.signalBuffer.length,
        indicators: this.indicatorBuffer.length,
      },
    };
  }

  /**
   * 关闭数据库
   */
  close(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }

    this.flush();

    this.db.close();
    logger.info('高频数据记录器已关闭');
  }
}

// =====================================================
// 导出单例
// =====================================================

let globalHFLogger: HighFrequencyDataLogger | null = null;

export function getGlobalHFLogger(): HighFrequencyDataLogger {
  if (!globalHFLogger) {
    globalHFLogger = new HighFrequencyDataLogger();
  }
  return globalHFLogger;
}
