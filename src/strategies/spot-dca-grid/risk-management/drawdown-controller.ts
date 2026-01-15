/**
 * 回撤控制器
 *
 * 功能：
 * - 监控账户回撤水平
 * - 三级回撤控制（警告/暂停/紧急）
 * - 自动调整仓位大小
 * - 触发恢复机制
 */

import type { CapitalConfig } from '../config/strategy-config';
import type { CoinPosition } from '../config/types';

// =====================================================
// 回撤配置
// =====================================================

export interface DrawdownControllerConfig {
  // 回撤阈值（%）
  warningLevel: number;         // 警告级别 (默认 10%)
  pauseLevel: number;           // 暂停级别 (默认 20%)
  emergencyLevel: number;       // 紧急级别 (默认 30%)
  recoveryLevel: number;        // 恢复级别 (默认 5%)

  // 操作配置
  warningAction: {
    reducePositionBy: number;   // 减少仓位百分比
    logWarning: boolean;
  };

  pauseAction: {
    pauseNewOrders: boolean;    // 暂停新开仓
    continueDCA: boolean;       // 继续执行 DCA
    reducePositionBy: number;   // 减少仓位百分比
  };

  emergencyAction: {
    closeAllPositions: boolean; // 平掉所有仓位
    emergencySellAll: boolean;  // 紧急全部卖出
    notifyUser: boolean;
  };

  // 计算配置
  calculation: {
    useHighWaterMark: boolean;   // 使用历史最高净值
    lookbackPeriod: number;      // 回看周期（天）
    minDataPoints: number;       // 最小数据点数
  };
}

// =====================================================
// 回撤状态
// =====================================================

export enum DrawdownState {
  NORMAL = 'normal',
  WARNING = 'warning',
  PAUSED = 'paused',
  EMERGENCY = 'emergency',
  RECOVERING = 'recovering'
}

// =====================================================
// 回撤数据
// =====================================================

export interface DrawdownData {
  // 当前状态
  state: DrawdownState;
  currentDrawdown: number;       // 当前回撤 (%)
  peakEquity: number;            // 峰值权益
  currentEquity: number;         // 当前权益
  totalCapital: number;          // 总资金

  // 历史数据
  equityHistory: { timestamp: number; equity: number }[];
  peakHistory: { timestamp: number; peak: number }[];

  // 时间信息
  peakTimestamp: number;
  lastUpdate: number;
  drawdownDuration: number;      // 回撤持续时长（毫秒）

  // 恢复信息
  inRecovery: boolean;
  recoveryStartEquity: number;
  recoveryStartTimestamp: number;
}

// =====================================================
// 回撤动作
// =====================================================

export interface DrawdownAction {
  type: 'warning' | 'pause' | 'emergency' | 'recovery' | 'none';
  state: DrawdownState;
  reason: string;
  actions: {
    shouldReducePosition: boolean;
    reductionPercentage: number;
    shouldPauseNewOrders: boolean;
    shouldCloseAll: boolean;
    shouldContinueDCA: boolean;
    shouldNotify: boolean;
  };
  metadata: {
    currentDrawdown: number;
    threshold: number;
    equityChange: number;
    duration: number;
  };
}

// =====================================================
// 回撤控制器类
// =====================================================

export class DrawdownController {
  private config: DrawdownControllerConfig;
  private capitalConfig: CapitalConfig;

  // 回撤状态
  private state: DrawdownState = DrawdownState.NORMAL;
  private peakEquity: number = 0;
  private currentEquity: number = 0;

  // 历史数据
  private equityHistory: { timestamp: number; equity: number }[] = [];
  private peakHistory: { timestamp: number; peak: number }[] = [];

  // 时间戳
  private peakTimestamp: number = Date.now();
  private lastUpdate: number = Date.now();

  // 恢复状态
  private inRecovery: boolean = false;
  private recoveryStartEquity: number = 0;
  private recoveryStartTimestamp: number = 0;

  // 事件回调
  private stateChangeCallback?: (action: DrawdownAction) => void;

  constructor(capitalConfig: CapitalConfig, config?: Partial<DrawdownControllerConfig>) {
    this.capitalConfig = capitalConfig;
    this.peakEquity = capitalConfig.totalCapital;
    this.currentEquity = capitalConfig.totalCapital;

    this.config = {
      warningLevel: 10,
      pauseLevel: 20,
      emergencyLevel: 30,
      recoveryLevel: 5,
      warningAction: {
        reducePositionBy: 20,
        logWarning: true
      },
      pauseAction: {
        pauseNewOrders: true,
        continueDCA: true,
        reducePositionBy: 50
      },
      emergencyAction: {
        closeAllPositions: true,
        emergencySellAll: false,
        notifyUser: true
      },
      calculation: {
        useHighWaterMark: true,
        lookbackPeriod: 30,
        minDataPoints: 10
      },
      ...config
    };
  }

  /**
   * 更新权益并检查回撤
   */
  async updateAndCheck(currentEquity: number, positions?: CoinPosition[]): Promise<DrawdownAction> {
    const previousEquity = this.currentEquity;
    this.currentEquity = currentEquity;
    this.lastUpdate = Date.now();

    // 更新历史记录
    this.equityHistory.push({
      timestamp: this.lastUpdate,
      equity: currentEquity
    });

    // 限制历史记录长度
    if (this.equityHistory.length > 1000) {
      this.equityHistory = this.equityHistory.slice(-1000);
    }

    // 更新峰值
    if (currentEquity > this.peakEquity) {
      this.peakEquity = currentEquity;
      this.peakTimestamp = this.lastUpdate;

      this.peakHistory.push({
        timestamp: this.lastUpdate,
        peak: currentEquity
      });

      if (this.peakHistory.length > 100) {
        this.peakHistory = this.peakHistory.slice(-100);
      }
    }

    // 计算回撤
    const drawdown = this.calculateDrawdown();

    // 确定状态和动作
    const action = this.determineAction(drawdown);

    // 状态变化时触发回调
    if (action.state !== this.state) {
      this.state = action.state;

      if (this.stateChangeCallback) {
        this.stateChangeCallback(action);
      }
    }

    // 处理恢复逻辑
    this.handleRecovery(drawdown);

    return action;
  }

  /**
   * 计算回撤
   */
  private calculateDrawdown(): number {
    if (this.peakEquity === 0) {
      return 0;
    }

    const drawdown = ((this.peakEquity - this.currentEquity) / this.peakEquity) * 100;
    return Math.max(0, drawdown);
  }

  /**
   * 确定回撤动作
   */
  private determineAction(drawdown: number): DrawdownAction {
    // 检查是否需要紧急平仓
    if (drawdown >= this.config.emergencyLevel) {
      return {
        type: 'emergency',
        state: DrawdownState.EMERGENCY,
        reason: `回撤 ${drawdown.toFixed(2)}% 达到紧急级别 ${this.config.emergencyLevel}%`,
        actions: {
          shouldReducePosition: true,
          reductionPercentage: 100,
          shouldPauseNewOrders: true,
          shouldCloseAll: this.config.emergencyAction.closeAllPositions,
          shouldContinueDCA: false,
          shouldNotify: this.config.emergencyAction.notifyUser
        },
        metadata: {
          currentDrawdown: drawdown,
          threshold: this.config.emergencyLevel,
          equityChange: this.currentEquity - this.peakEquity,
          duration: Date.now() - this.peakTimestamp
        }
      };
    }

    // 检查是否需要暂停
    if (drawdown >= this.config.pauseLevel) {
      return {
        type: 'pause',
        state: DrawdownState.PAUSED,
        reason: `回撤 ${drawdown.toFixed(2)}% 达到暂停级别 ${this.config.pauseLevel}%`,
        actions: {
          shouldReducePosition: true,
          reductionPercentage: this.config.pauseAction.reducePositionBy,
          shouldPauseNewOrders: this.config.pauseAction.pauseNewOrders,
          shouldCloseAll: false,
          shouldContinueDCA: this.config.pauseAction.continueDCA,
          shouldNotify: true
        },
        metadata: {
          currentDrawdown: drawdown,
          threshold: this.config.pauseLevel,
          equityChange: this.currentEquity - this.peakEquity,
          duration: Date.now() - this.peakTimestamp
        }
      };
    }

    // 检查是否需要警告
    if (drawdown >= this.config.warningLevel) {
      return {
        type: 'warning',
        state: DrawdownState.WARNING,
        reason: `回撤 ${drawdown.toFixed(2)}% 达到警告级别 ${this.config.warningLevel}%`,
        actions: {
          shouldReducePosition: true,
          reductionPercentage: this.config.warningAction.reducePositionBy,
          shouldPauseNewOrders: false,
          shouldCloseAll: false,
          shouldContinueDCA: true,
          shouldNotify: this.config.warningAction.logWarning
        },
        metadata: {
          currentDrawdown: drawdown,
          threshold: this.config.warningLevel,
          equityChange: this.currentEquity - this.peakEquity,
          duration: Date.now() - this.peakTimestamp
        }
      };
    }

    // 检查是否在恢复中
    if (this.inRecovery) {
      const recoveryGain = ((this.currentEquity - this.recoveryStartEquity) / this.recoveryStartEquity) * 100;

      if (recoveryGain >= this.config.recoveryLevel) {
        return {
          type: 'recovery',
          state: DrawdownState.RECOVERING,
          reason: `已恢复 ${recoveryGain.toFixed(2)}%，超过恢复阈值 ${this.config.recoveryLevel}%`,
          actions: {
            shouldReducePosition: false,
            reductionPercentage: 0,
            shouldPauseNewOrders: false,
            shouldCloseAll: false,
            shouldContinueDCA: true,
            shouldNotify: true
          },
          metadata: {
            currentDrawdown: drawdown,
            threshold: this.config.recoveryLevel,
            equityChange: this.currentEquity - this.recoveryStartEquity,
            duration: Date.now() - this.recoveryStartTimestamp
          }
        };
      }
    }

    // 正常状态
    return {
      type: 'none',
      state: DrawdownState.NORMAL,
      reason: '回撤水平正常',
      actions: {
        shouldReducePosition: false,
        reductionPercentage: 0,
        shouldPauseNewOrders: false,
        shouldCloseAll: false,
        shouldContinueDCA: true,
        shouldNotify: false
      },
      metadata: {
        currentDrawdown: drawdown,
        threshold: 0,
        equityChange: 0,
        duration: 0
      }
    };
  }

  /**
   * 处理恢复逻辑
   */
  private handleRecovery(drawdown: number): void {
    // 如果从回撤状态恢复到正常范围
    if (this.state !== DrawdownState.NORMAL && drawdown < this.config.recoveryLevel) {
      if (!this.inRecovery) {
        this.inRecovery = true;
        this.recoveryStartEquity = this.currentEquity;
        this.recoveryStartTimestamp = Date.now();
      }
    } else if (drawdown < this.config.recoveryLevel / 2) {
      // 完全恢复
      this.inRecovery = false;
      this.recoveryStartEquity = 0;
      this.recoveryStartTimestamp = 0;

      // 重置状态为正常
      if (this.state !== DrawdownState.NORMAL) {
        this.state = DrawdownState.NORMAL;
      }
    }
  }

  /**
   * 计算最大回撤
   */
  calculateMaxDrawdown(periodMs?: number): number {
    let relevantHistory = this.equityHistory;

    if (periodMs) {
      const cutoffTime = Date.now() - periodMs;
      relevantHistory = this.equityHistory.filter(h => h.timestamp >= cutoffTime);
    }

    if (relevantHistory.length < this.config.calculation.minDataPoints) {
      return 0;
    }

    let maxDrawdown = 0;
    let peak = relevantHistory[0]?.equity || 0;

    for (const point of relevantHistory) {
      if (point.equity > peak) {
        peak = point.equity;
      }

      const drawdown = ((peak - point.equity) / peak) * 100;
      if (drawdown > maxDrawdown) {
        maxDrawdown = drawdown;
      }
    }

    return maxDrawdown;
  }

  /**
   * 计算平均回撤
   */
  calculateAverageDrawdown(periodMs?: number): number {
    let relevantHistory = this.equityHistory;

    if (periodMs) {
      const cutoffTime = Date.now() - periodMs;
      relevantHistory = this.equityHistory.filter(h => h.timestamp >= cutoffTime);
    }

    if (relevantHistory.length < this.config.calculation.minDataPoints) {
      return 0;
    }

    let sumDrawdown = 0;
    let count = 0;
    let peak = relevantHistory[0]?.equity || 0;

    for (const point of relevantHistory) {
      if (point.equity > peak) {
        peak = point.equity;
      }

      const drawdown = ((peak - point.equity) / peak) * 100;
      if (drawdown > 0) {
        sumDrawdown += drawdown;
        count++;
      }
    }

    return count > 0 ? sumDrawdown / count : 0;
  }

  /**
   * 获取回撤数据
   */
  getDrawdownData(): DrawdownData {
    return {
      state: this.state,
      currentDrawdown: this.calculateDrawdown(),
      peakEquity: this.peakEquity,
      currentEquity: this.currentEquity,
      totalCapital: this.capitalConfig.totalCapital,
      equityHistory: [...this.equityHistory],
      peakHistory: [...this.peakHistory],
      peakTimestamp: this.peakTimestamp,
      lastUpdate: this.lastUpdate,
      drawdownDuration: Date.now() - this.peakTimestamp,
      inRecovery: this.inRecovery,
      recoveryStartEquity: this.recoveryStartEquity,
      recoveryStartTimestamp: this.recoveryStartTimestamp
    };
  }

  /**
   * 获取当前状态
   */
  getState(): DrawdownState {
    return this.state;
  }

  /**
   * 检查是否可以开新仓
   */
  canOpenNewPosition(): boolean {
    return this.state === DrawdownState.NORMAL ||
           this.state === DrawdownState.RECOVERING ||
           (this.state === DrawdownState.PAUSED && this.config.pauseAction.continueDCA);
  }

  /**
   * 检查是否应该减小仓位
   */
  shouldReducePosition(): { shouldReduce: boolean; percentage: number } {
    switch (this.state) {
      case DrawdownState.WARNING:
        return { shouldReduce: true, percentage: this.config.warningAction.reducePositionBy };
      case DrawdownState.PAUSED:
        return { shouldReduce: true, percentage: this.config.pauseAction.reducePositionBy };
      case DrawdownState.EMERGENCY:
        return { shouldReduce: true, percentage: 100 };
      default:
        return { shouldReduce: false, percentage: 0 };
    }
  }

  /**
   * 检查是否应该平仓
   */
  shouldCloseAllPositions(): boolean {
    return this.state === DrawdownState.EMERGENCY && this.config.emergencyAction.closeAllPositions;
  }

  /**
   * 设置状态变化回调
   */
  setStateChangeCallback(callback: (action: DrawdownAction) => void): void {
    this.stateChangeCallback = callback;
  }

  /**
   * 重置回撤状态
   */
  reset(): void {
    this.state = DrawdownState.NORMAL;
    this.peakEquity = this.currentEquity;
    this.peakTimestamp = Date.now();
    this.inRecovery = false;
    this.recoveryStartEquity = 0;
    this.recoveryStartTimestamp = 0;
  }

  /**
   * 重置所有数据
   */
  resetAll(newCapital?: number): void {
    if (newCapital) {
      this.capitalConfig.totalCapital = newCapital;
      this.peakEquity = newCapital;
      this.currentEquity = newCapital;
    }

    this.state = DrawdownState.NORMAL;
    this.peakTimestamp = Date.now();
    this.lastUpdate = Date.now();
    this.inRecovery = false;
    this.recoveryStartEquity = 0;
    this.recoveryStartTimestamp = 0;
    this.equityHistory = [];
    this.peakHistory = [];
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<DrawdownControllerConfig>): void {
    this.config = {
      warningLevel: config.warningLevel ?? this.config.warningLevel,
      pauseLevel: config.pauseLevel ?? this.config.pauseLevel,
      emergencyLevel: config.emergencyLevel ?? this.config.emergencyLevel,
      recoveryLevel: config.recoveryLevel ?? this.config.recoveryLevel,
      warningAction: { ...this.config.warningAction, ...config.warningAction },
      pauseAction: { ...this.config.pauseAction, ...config.pauseAction },
      emergencyAction: { ...this.config.emergencyAction, ...config.emergencyAction },
      calculation: { ...this.config.calculation, ...config.calculation }
    };
  }

  /**
   * 获取配置
   */
  getConfig(): DrawdownControllerConfig {
    return { ...this.config };
  }

  /**
   * 生成报告
   */
  generateReport(): string {
    const data = this.getDrawdownData();
    const maxDrawdown = this.calculateMaxDrawdown(30 * 24 * 60 * 60 * 1000); // 30 天
    const avgDrawdown = this.calculateAverageDrawdown(30 * 24 * 60 * 60 * 1000);

    const stateText = {
      [DrawdownState.NORMAL]: '正常 ✓',
      [DrawdownState.WARNING]: '警告 ⚠',
      [DrawdownState.PAUSED]: '暂停 ⏸',
      [DrawdownState.EMERGENCY]: '紧急 🚨',
      [DrawdownState.RECOVERING]: '恢复中 📈'
    };

    const durationHours = data.drawdownDuration / (60 * 60 * 1000);
    const durationDays = durationHours / 24;

    return `
回撤状态报告
========================
当前状态: ${stateText[data.state]}

权益情况:
  当前权益: ${data.currentEquity.toFixed(2)} USDT
  峰值权益: ${data.peakEquity.toFixed(2)} USDT
  总资金: ${data.totalCapital.toFixed(2)} USDT
  权益变化: ${(data.currentEquity - data.totalCapital).toFixed(2)} USDT (${((data.currentEquity - data.totalCapital) / data.totalCapital * 100).toFixed(2)}%)

回撤情况:
  当前回撤: ${data.currentDrawdown.toFixed(2)}%
  最大回撤 (30天): ${maxDrawdown.toFixed(2)}%
  平均回撤 (30天): ${avgDrawdown.toFixed(2)}%
  回撤时长: ${durationDays.toFixed(1)} 天

恢复状态: ${data.inRecovery ? `恢复中 (+${((data.currentEquity - data.recoveryStartEquity) / data.recoveryStartEquity * 100).toFixed(2)}%)` : '无'}

阈值配置:
  警告级别: ${this.config.warningLevel}%
  暂停级别: ${this.config.pauseLevel}%
  紧急级别: ${this.config.emergencyLevel}%
  恢复级别: ${this.config.recoveryLevel}%

操作状态:
  可开新仓: ${this.canOpenNewPosition() ? '是' : '否'}
  应减仓: ${this.shouldReducePosition().shouldReduce ? `是 (-${this.shouldReducePosition().percentage}%)` : '否'}
  应平仓: ${this.shouldCloseAllPositions() ? '是 🚨' : '否'}

最后更新: ${new Date(data.lastUpdate).toLocaleString()}
峰值时间: ${new Date(data.peakTimestamp).toLocaleString()}
    `.trim();
  }
}
