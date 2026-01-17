/**
 * 策略状态管理器
 *
 * 管理交易状态（IDLE/LONG_POSITION/SHORT_POSITION等）
 * 根据信号和置信度决定操作（BUY/SELL/HOLD/CLOSE）
 */

import type { AggregatedSignal } from '../statistics';

/**
 * 策略状态枚举
 */
export enum StrategyState {
  /** 观望状态（无仓位） */
  IDLE = 'IDLE',

  /** 持有多头仓位 */
  LONG_POSITION = 'LONG_POSITION',

  /** 持有空头仓位 */
  SHORT_POSITION = 'SHORT_POSITION',

  /** 等待入场（信号已触发，等待确认） */
  PENDING_ENTRY = 'PENDING_ENTRY',

  /** 等待出场（止盈/止损已设置） */
  PENDING_EXIT = 'PENDING_EXIT',

  /** 风险控制中（超过最大回撤） */
  RISK_CONTROL = 'RISK_CONTROL',

  /** 暂停交易（市场条件不适合） */
  SUSPENDED = 'SUSPENDED',
}

/**
 * 仓位信息
 */
export interface Position {
  /** 入场价格 */
  entryPrice: number;
  /** 入场时间 */
  entryTime: number;
  /** 止损距离（百分比） */
  stopLossDistance: number;
  /** 止盈距离（百分比） */
  takeProfitDistance: number;
  /** 仓位大小（百分比） */
  size: number;
  /** 方向 */
  direction: 'long' | 'short';
  /** 当前盈亏（百分比） */
  pnl?: number;
}

/**
 * 决策结果
 */
export interface Decision {
  /** 操作 */
  action: 'BUY' | 'SELL' | 'HOLD' | 'CLOSE_LONG' | 'CLOSE_SHORT';
  /** 理由 */
  reason: string;
  /** 新状态 */
  newState: StrategyState;
  /** 建议的止损止盈（仅入场时） */
  stopLossDistance?: number;
  takeProfitDistance?: number;
  positionSize?: number;
}

/**
 * 策略状态管理器配置
 */
export interface StrategyStateManagerConfig {
  /** 最小置信度阈值 */
  minConfidence?: number;
  /** 最大回撤（百分比） */
  maxDrawdown?: number;
  /** 是否启用风险控制 */
  enableRiskControl?: boolean;
  /** 是否启用市场状态过滤 */
  enableMarketFilter?: boolean;
  /** 最小ADX值 */
  minADX?: number;
}

/**
 * 策略状态管理器
 */
export class StrategyStateManager {
  private config: Required<StrategyStateManagerConfig>;
  private states = new Map<string, StrategyState>();
  private positions = new Map<string, Position>();
  private peakEquity = new Map<string, number>();
  private currentEquity = new Map<string, number>();

  constructor(config: StrategyStateManagerConfig = {}) {
    this.config = {
      minConfidence: config.minConfidence ?? 0.65,
      maxDrawdown: config.maxDrawdown ?? 0.15,
      enableRiskControl: config.enableRiskControl ?? true,
      enableMarketFilter: config.enableMarketFilter ?? true,
      minADX: config.minADX ?? 20,
    };
  }

  /**
   * 根据信号和置信度决定操作
   */
  decideAction(
    coin: string,
    signal: AggregatedSignal,
    confidence: number,
    marketState: {
      trend: string;
      volatility: string;
      adx?: number;
      rsi?: number;
      price?: number;
    },
    currentPrice?: number
  ): Decision {
    const currentState = this.states.get(coin) || StrategyState.IDLE;

    // 1. 检查风险控制
    if (this.config.enableRiskControl && this.isInRiskControl(coin)) {
      return {
        action: 'HOLD',
        reason: '风险控制中，暂停交易',
        newState: StrategyState.RISK_CONTROL,
      };
    }

    // 2. 检查市场条件
    if (this.config.enableMarketFilter && !this.isMarketSuitable(marketState)) {
      return {
        action: 'HOLD',
        reason: `市场条件不适合 (ADX:${marketState.adx?.toFixed(0) || 'N/A'} < ${this.config.minADX})`,
        newState: StrategyState.SUSPENDED,
      };
    }

    // 3. 更新持仓盈亏
    if (currentPrice && this.positions.has(coin)) {
      this.updatePositionPnL(coin, currentPrice);
    }

    // 4. 根据当前状态决定操作
    switch (currentState) {
      case StrategyState.IDLE:
      case StrategyState.SUSPENDED:
        return this.handleIdleState(coin, signal, confidence, marketState);

      case StrategyState.LONG_POSITION:
        return this.handleLongPosition(coin, signal, confidence, marketState, currentPrice);

      case StrategyState.SHORT_POSITION:
        return this.handleShortPosition(coin, signal, confidence, marketState, currentPrice);

      case StrategyState.RISK_CONTROL:
        return {
          action: 'HOLD',
          reason: '风险控制中，暂停交易',
          newState: StrategyState.RISK_CONTROL,
        };

      default:
        return { action: 'HOLD', reason: '未知状态', newState: StrategyState.IDLE };
    }
  }

  /**
   * 处理观望状态
   */
  private handleIdleState(
    coin: string,
    signal: AggregatedSignal,
    confidence: number,
    marketState: any
  ): Decision {
    // 置信度阈值检查
    if (confidence < this.config.minConfidence) {
      return {
        action: 'HOLD',
        reason: `置信度不足 (${(confidence * 100).toFixed(0)}% < ${(this.config.minConfidence * 100).toFixed(0)}%)`,
        newState: StrategyState.IDLE,
      };
    }

    // 多头信号
    if (signal.direction === 'bullish') {
      return {
        action: 'BUY',
        reason: `多头信号 (${this.getSignalNames(signal)}), 置信度${(confidence * 100).toFixed(0)}%`,
        newState: StrategyState.LONG_POSITION,
        stopLossDistance: signal.stopLossDistance,
        takeProfitDistance: signal.takeProfitDistance,
        positionSize: signal.positionSize,
      };
    }

    // 空头信号
    if (signal.direction === 'bearish') {
      return {
        action: 'SELL',
        reason: `空头信号 (${this.getSignalNames(signal)}), 置信度${(confidence * 100).toFixed(0)}%`,
        newState: StrategyState.SHORT_POSITION,
        stopLossDistance: signal.stopLossDistance,
        takeProfitDistance: signal.takeProfitDistance,
        positionSize: signal.positionSize,
      };
    }

    return {
      action: 'HOLD',
      reason: '无明确信号',
      newState: StrategyState.IDLE,
    };
  }

  /**
   * 处理多头仓位
   */
  private handleLongPosition(
    coin: string,
    signal: AggregatedSignal,
    confidence: number,
    marketState: any,
    currentPrice?: number
  ): Decision {
    const position = this.positions.get(coin);
    if (!position) {
      return { action: 'HOLD', reason: '仓位数据异常', newState: StrategyState.IDLE };
    }

    // 如果没有当前价格，继续持有
    if (!currentPrice) {
      return {
        action: 'HOLD',
        reason: '等待价格更新',
        newState: StrategyState.LONG_POSITION,
      };
    }

    // 计算当前盈亏
    const pnl = (currentPrice - position.entryPrice) / position.entryPrice;

    // 1. 检查止损
    if (pnl <= -position.stopLossDistance) {
      return {
        action: 'CLOSE_LONG',
        reason: `触发止损 (亏损${(pnl * 100).toFixed(1)}%, 入场${position.entryPrice})`,
        newState: StrategyState.IDLE,
      };
    }

    // 2. 检查止盈
    if (pnl >= position.takeProfitDistance) {
      return {
        action: 'CLOSE_LONG',
        reason: `触发止盈 (盈利${(pnl * 100).toFixed(1)}%, 入场${position.entryPrice})`,
        newState: StrategyState.IDLE,
      };
    }

    // 3. 强反向信号（且置信度高）
    if (signal.direction === 'bearish' && confidence > 0.75) {
      return {
        action: 'CLOSE_LONG',
        reason: `强反向信号 (${this.getSignalNames(signal)}), 平仓观望 (置信度${(confidence * 100).toFixed(0)}%)`,
        newState: StrategyState.IDLE,
      };
    }

    // 4. 市场状态转弱
    if (marketState.trend === 'downtrend' || marketState.trend === 'strong_downtrend') {
      return {
        action: 'CLOSE_LONG',
        reason: `市场转弱 (${marketState.trend}), 平仓观望`,
        newState: StrategyState.IDLE,
      };
    }

    // 5. ADX过低（趋势消失）
    if (marketState.adx !== undefined && marketState.adx < this.config.minADX) {
      return {
        action: 'CLOSE_LONG',
        reason: `趋势消失 (ADX:${marketState.adx.toFixed(0)}), 平仓观望`,
        newState: StrategyState.IDLE,
      };
    }

    // 继续持有
    return {
      action: 'HOLD',
      reason: `持有中 (盈亏${(pnl * 100).toFixed(1)}%, 入场${position.entryPrice}, 当前${currentPrice})`,
      newState: StrategyState.LONG_POSITION,
    };
  }

  /**
   * 处理空头仓位
   */
  private handleShortPosition(
    coin: string,
    signal: AggregatedSignal,
    confidence: number,
    marketState: any,
    currentPrice?: number
  ): Decision {
    const position = this.positions.get(coin);
    if (!position) {
      return { action: 'HOLD', reason: '仓位数据异常', newState: StrategyState.IDLE };
    }

    if (!currentPrice) {
      return {
        action: 'HOLD',
        reason: '等待价格更新',
        newState: StrategyState.SHORT_POSITION,
      };
    }

    // 计算当前盈亏（空头）
    const pnl = (position.entryPrice - currentPrice) / position.entryPrice;

    // 1. 检查止损
    if (pnl <= -position.stopLossDistance) {
      return {
        action: 'CLOSE_SHORT',
        reason: `触发止损 (亏损${(pnl * 100).toFixed(1)}%, 入场${position.entryPrice})`,
        newState: StrategyState.IDLE,
      };
    }

    // 2. 检查止盈
    if (pnl >= position.takeProfitDistance) {
      return {
        action: 'CLOSE_SHORT',
        reason: `触发止盈 (盈利${(pnl * 100).toFixed(1)}%, 入场${position.entryPrice})`,
        newState: StrategyState.IDLE,
      };
    }

    // 3. 强反向信号
    if (signal.direction === 'bullish' && confidence > 0.75) {
      return {
        action: 'CLOSE_SHORT',
        reason: `强反向信号 (${this.getSignalNames(signal)}), 平仓观望 (置信度${(confidence * 100).toFixed(0)}%)`,
        newState: StrategyState.IDLE,
      };
    }

    // 4. 市场状态转强
    if (marketState.trend === 'uptrend' || marketState.trend === 'strong_uptrend') {
      return {
        action: 'CLOSE_SHORT',
        reason: `市场转强 (${marketState.trend}), 平仓观望`,
        newState: StrategyState.IDLE,
      };
    }

    // 5. ADX过低
    if (marketState.adx !== undefined && marketState.adx < this.config.minADX) {
      return {
        action: 'CLOSE_SHORT',
        reason: `趋势消失 (ADX:${marketState.adx.toFixed(0)}), 平仓观望`,
        newState: StrategyState.IDLE,
      };
    }

    return {
      action: 'HOLD',
      reason: `持有中 (盈亏${(pnl * 100).toFixed(1)}%, 入场${position.entryPrice}, 当前${currentPrice})`,
      newState: StrategyState.SHORT_POSITION,
    };
  }

  /**
   * 更新仓位信息
   */
  updatePosition(
    coin: string,
    entryPrice: number,
    stopLossDistance: number,
    takeProfitDistance: number,
    positionSize: number,
    direction: 'long' | 'short'
  ): void {
    this.positions.set(coin, {
      entryPrice,
      entryTime: Date.now(),
      stopLossDistance,
      takeProfitDistance,
      size: positionSize,
      direction,
    });
    this.states.set(
      coin,
      direction === 'long' ? StrategyState.LONG_POSITION : StrategyState.SHORT_POSITION
    );
  }

  /**
   * 平仓
   */
  closePosition(coin: string): void {
    this.positions.delete(coin);
    this.states.set(coin, StrategyState.IDLE);
  }

  /**
   * 更新持仓盈亏
   */
  private updatePositionPnL(coin: string, currentPrice: number): void {
    const position = this.positions.get(coin);
    if (!position) return;

    if (position.direction === 'long') {
      position.pnl = (currentPrice - position.entryPrice) / position.entryPrice;
    } else {
      position.pnl = (position.entryPrice - currentPrice) / position.entryPrice;
    }
  }

  /**
   * 获取当前状态
   */
  getState(coin: string): StrategyState {
    return this.states.get(coin) || StrategyState.IDLE;
  }

  /**
   * 获取仓位信息
   */
  getPosition(coin: string): Position | undefined {
    return this.positions.get(coin);
  }

  /**
   * 更新权益（用于风险控制）
   */
  updateEquity(coin: string, equity: number): void {
    const peak = this.peakEquity.get(coin) || equity;
    if (equity > peak) {
      this.peakEquity.set(coin, equity);
    }
    this.currentEquity.set(coin, equity);
  }

  /**
   * 检查是否在风险控制中
   */
  private isInRiskControl(coin: string): boolean {
    if (!this.config.enableRiskControl) return false;

    const current = this.currentEquity.get(coin);
    const peak = this.peakEquity.get(coin);

    if (!current || !peak) return false;

    const drawdown = (peak - current) / peak;
    return drawdown >= this.config.maxDrawdown;
  }

  /**
   * 检查市场条件是否适合
   */
  private isMarketSuitable(marketState: any): boolean {
    if (marketState.adx === undefined) return true; // 无ADX数据，允许交易
    return marketState.adx >= this.config.minADX;
  }

  /**
   * 获取信号名称
   */
  private getSignalNames(signal: AggregatedSignal): string {
    if (signal.signals.length === 0) return '无信号';

    const topSignals = signal.signals
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 2)
      .map(s => this.getSignalName(s.type))
      .join('+');

    return topSignals;
  }

  private getSignalName(type: string): string {
    const names: Record<string, string> = {
      'MA_7_25_CROSSOVER': 'MA金叉',
      'MA_7_25_CROSSUNDER': 'MA死叉',
      'RSI_OVERSOLD': 'RSI超卖',
      'MACD_BULLISH_CROSS': 'MACD金叉',
    };
    return names[type] || type;
  }

  /**
   * 生成状态报告
   */
  generateStateReport(coin: string, currentPrice?: number): string {
    const state = this.getState(coin);
    const position = this.positions.get(coin);

    let report = `\n=== ${coin} 策略状态 ===\n`;
    report += `状态: ${this.getStateName(state)}\n`;

    if (position) {
      report += `方向: ${position.direction === 'long' ? '多头' : '空头'}\n`;
      report += `入场价: ${position.entryPrice}\n`;
      report += `止损: ${(position.stopLossDistance * 100).toFixed(1)}%\n`;
      report += `止盈: ${(position.takeProfitDistance * 100).toFixed(1)}%\n`;
      report += `仓位: ${(position.size * 100).toFixed(1)}%\n`;

      if (currentPrice && position.pnl !== undefined) {
        const pnlPercent = (position.pnl * 100).toFixed(1);
        const pnlStatus = position.pnl >= 0 ? '盈利' : '亏损';
        report += `当前${pnlStatus}: ${pnlPercent}%\n`;
      }
    }

    // 权益信息
    const current = this.currentEquity.get(coin);
    const peak = this.peakEquity.get(coin);
    if (current && peak) {
      const drawdown = ((peak - current) / peak * 100).toFixed(1);
      report += `当前权益: ${current.toFixed(2)}\n`;
      report += `最高权益: ${peak.toFixed(2)}\n`;
      report += `回撤: ${drawdown}%\n`;
    }

    return report;
  }

  private getStateName(state: StrategyState): string {
    const names: Record<StrategyState, string> = {
      [StrategyState.IDLE]: '观望',
      [StrategyState.LONG_POSITION]: '持多',
      [StrategyState.SHORT_POSITION]: '持空',
      [StrategyState.PENDING_ENTRY]: '等待入场',
      [StrategyState.PENDING_EXIT]: '等待出场',
      [StrategyState.RISK_CONTROL]: '风险控制',
      [StrategyState.SUSPENDED]: '暂停交易',
    };
    return names[state] || state;
  }

  /**
   * 重置币种状态
   */
  reset(coin: string): void {
    this.states.delete(coin);
    this.positions.delete(coin);
    this.peakEquity.delete(coin);
    this.currentEquity.delete(coin);
  }

  /**
   * 获取所有币种的状态
   */
  getAllStates(): Map<string, StrategyState> {
    return new Map(this.states);
  }
}
