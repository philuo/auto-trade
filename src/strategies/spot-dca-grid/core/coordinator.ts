/**
 * 协同调度器
 *
 * 功能：
 * - 协调 DCA 和网格策略的决策
 * - 处理决策冲突
 * - 管理决策优先级
 * - 综合风险评估
 */

import type { AllowedCoin, Decision } from '../config/strategy-config';
import type { MarketData, CoinPosition } from '../config/types';
import { DCAEngine } from './dca-engine';
import { GridEngine } from './grid-engine';

// =====================================================
// 协同调度器状态
// =====================================================

/**
 * 币种协同状态
 */
interface CoordinatorCoinState {
  coin: AllowedCoin;
  enabled: boolean;

  // 上次决策
  lastDecision?: Decision;
  lastDecisionTime: number;

  // 决策计数
  dcaDecisions: number;
  gridDecisions: number;
  riskDecisions: number;

  // 协同模式
  mode: 'normal' | 'dca_priority' | 'grid_priority' | 'pause';
  modeReason: string;
  modeSince: number;
}

// =====================================================
// 协同调度器类
// =====================================================

export class StrategyCoordinator {
  private dcaEngine: DCAEngine;
  private gridEngine: GridEngine;
  private states: Map<AllowedCoin, CoordinatorCoinState> = new Map();

  constructor(dcaEngine: DCAEngine, gridEngine: GridEngine) {
    this.dcaEngine = dcaEngine;
    this.gridEngine = gridEngine;
  }

  /**
   * 初始化币种状态
   */
  initializeCoin(coin: AllowedCoin): void {
    const state: CoordinatorCoinState = {
      coin,
      enabled: true,
      lastDecisionTime: 0,
      dcaDecisions: 0,
      gridDecisions: 0,
      riskDecisions: 0,
      mode: 'normal',
      modeReason: '初始化',
      modeSince: Date.now()
    };

    this.states.set(coin, state);
  }

  /**
   * 主决策函数
   */
  async makeDecision(
    coin: AllowedCoin,
    marketData: MarketData,
    position: CoinPosition
  ): Promise<Decision | null> {
    const state = this.states.get(coin);
    if (!state || !state.enabled) {
      return null;
    }

    // 检查是否暂停
    if (state.mode === 'pause') {
      return {
        coin,
        action: 'hold',
        type: 'risk',
        reason: `策略暂停: ${state.modeReason}`,
        urgency: 'low',
        timestamp: Date.now()
      };
    }

    // 收集所有决策
    const decisions: Decision[] = [];

    // 1. DCA 决策
    if (this.dcaEngine.getConfig().enabled) {
      const dcaOrder = await this.dcaEngine.checkDCA(coin, marketData);
      if (dcaOrder) {
        decisions.push({
          coin,
          action: 'buy',
          type: 'dca',
          reason: dcaOrder.reason,
          size: dcaOrder.size,
          price: dcaOrder.price,
          urgency: this.calculateDCAUrgency(dcaOrder, position),
          timestamp: Date.now()
        });
      }
    }

    // 2. 网格决策
    if (this.gridEngine.getConfig().enabled) {
      const pendingOrders = this.gridEngine.getPendingGridOrders(coin);

      // 检查是否有需要执行的网格订单
      if (pendingOrders.length > 0) {
        // 取第一个待处理的订单
        const order = pendingOrders[0];
        if (order) {
          decisions.push({
            coin,
            action: order.type,
            type: 'grid',
            reason: `grid_order_${order.type}`,
            price: order.price,
            urgency: 'low',
            timestamp: Date.now()
          });
        }
      }
    }

    // 3. 根据协同模式处理决策
    const finalDecision = this.prioritizeDecisions(decisions, state, position);

    if (finalDecision) {
      state.lastDecision = finalDecision;
      state.lastDecisionTime = Date.now();

      // 更新计数
      if (finalDecision.type === 'dca') {
        state.dcaDecisions++;
      } else if (finalDecision.type === 'grid') {
        state.gridDecisions++;
      } else if (finalDecision.type === 'risk') {
        state.riskDecisions++;
      }
    }

    return finalDecision;
  }

  /**
   * 决策优先级处理
   */
  private prioritizeDecisions(
    decisions: Decision[],
    state: CoordinatorCoinState,
    position: CoinPosition
  ): Decision | null {
    if (decisions.length === 0) {
      return null;
    }

    // 按优先级排序
    decisions.sort((a, b) => {
      // 风险决策优先级最高
      if (a.type === 'risk' && b.type !== 'risk') return -1;
      if (b.type === 'risk' && a.type !== 'risk') return 1;

      // 紧急程度
      const urgencyOrder = { high: 0, medium: 1, low: 2 };
      return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    });

    // 根据协同模式选择决策
    switch (state.mode) {
      case 'dca_priority':
        // 优先 DCA
        const dcaDecision = decisions.find(d => d.type === 'dca');
        if (dcaDecision) return dcaDecision;
        return decisions[0] || null;

      case 'grid_priority':
        // 优先网格
        const gridDecision = decisions.find(d => d.type === 'grid');
        if (gridDecision) return gridDecision;
        return decisions[0] || null;

      case 'normal':
      default:
        // 正常模式：根据市场状态动态选择
        return this.selectNormalModeDecision(decisions, state, position);
    }
  }

  /**
   * 正常模式下的决策选择
   */
  private selectNormalModeDecision(
    decisions: Decision[],
    _state: CoordinatorCoinState,
    position: CoinPosition
  ): Decision | null {
    // 检查是否应该优先执行 DCA
    if (this.shouldPrioritizeDCA(position)) {
      const dcaDecision = decisions.find(d => d.type === 'dca');
      if (dcaDecision) {
        return dcaDecision;
      }
    }

    // 检查是否应该优先执行网格
    if (this.shouldPrioritizeGrid(position)) {
      const gridDecision = decisions.find(d => d.type === 'grid');
      if (gridDecision) {
        return gridDecision;
      }
    }

    // 默认返回第一个决策
    return decisions[0] || null;
  }

  /**
   * 判断是否应该优先执行 DCA
   */
  private shouldPrioritizeDCA(position: CoinPosition): boolean {
    // 条件1：浮亏超过 5%
    if (position.unrealizedPnLPercent < -5) {
      return true;
    }

    // 条件2：使用 DCA 引擎的判断
    const coin = position.coin as AllowedCoin;
    return this.dcaEngine.shouldPrioritizeDCA(coin, position);
  }

  /**
   * 判断是否应该优先执行网格
   */
  private shouldPrioritizeGrid(position: CoinPosition): boolean {
    // 当盈亏在 ±3% 之间时，优先网格交易
    if (Math.abs(position.unrealizedPnLPercent) < 3) {
      return true;
    }

    return false;
  }

  /**
   * 计算 DCA 紧急程度
   */
  private calculateDCAUrgency(dcaOrder: any, position: CoinPosition): 'low' | 'medium' | 'high' {
    // 逆向 DCA 更紧急
    if (dcaOrder.type === 'reverse_dca') {
      // 跌幅越大越紧急
      if (dcaOrder.level && dcaOrder.level >= 4) {
        return 'high';
      }
      return 'medium';
    }

    // 常规 DCA 优先级较低
    return 'low';
  }

  /**
   * 设置协同模式
   */
  setMode(coin: AllowedCoin, mode: 'normal' | 'dca_priority' | 'grid_priority' | 'pause', reason: string): void {
    const state = this.states.get(coin);
    if (!state) {
      return;
    }

    state.mode = mode;
    state.modeReason = reason;
    state.modeSince = Date.now();
  }

  /**
   * 获取协同模式
   */
  getMode(coin: AllowedCoin): { mode: string; reason: string; since: number } | null {
    const state = this.states.get(coin);
    if (!state) {
      return null;
    }

    return {
      mode: state.mode,
      reason: state.modeReason,
      since: state.modeSince
    };
  }

  /**
   * 自动调整协同模式
   */
  async autoAdjustMode(coin: AllowedCoin, position: CoinPosition): Promise<void> {
    const state = this.states.get(coin);
    if (!state) {
      return;
    }

    const pnl = position.unrealizedPnLPercent;

    // 根据盈亏情况自动调整模式
    if (pnl < -10) {
      // 大幅亏损：DCA 优先模式
      if (state.mode !== 'dca_priority') {
        this.setMode(coin, 'dca_priority', `大幅亏损: ${pnl.toFixed(1)}%`);
      }
    } else if (pnl > 10) {
      // 大幅盈利：网格优先模式（锁定利润）
      if (state.mode !== 'grid_priority') {
        this.setMode(coin, 'grid_priority', `大幅盈利: ${pnl.toFixed(1)}%`);
      }
    } else if (Math.abs(pnl) < 3) {
      // 正常范围：正常模式
      if (state.mode !== 'normal') {
        this.setMode(coin, 'normal', '盈亏正常');
      }
    }
  }

  /**
   * 获取币种状态
   */
  getCoinState(coin: AllowedCoin): CoordinatorCoinState | undefined {
    return this.states.get(coin);
  }

  /**
   * 获取所有状态
   */
  getAllStates(): Map<AllowedCoin, CoordinatorCoinState> {
    return new Map(this.states);
  }

  /**
   * 重置币种状态
   */
  resetCoin(coin: AllowedCoin): void {
    this.states.delete(coin);
  }

  /**
   * 重置所有状态
   */
  resetAll(): void {
    this.states.clear();
  }

  /**
   * 生成状态报告
   */
  generateReport(coin: AllowedCoin): string {
    const state = this.states.get(coin);
    if (!state) {
      return `协同调度: ${coin} 未初始化`;
    }

    const modeDuration = Date.now() - state.modeSince;
    const modeHours = modeDuration / (1000 * 60 * 60);

    return `
协同调度状态: ${coin}
========================
启用状态: ${state.enabled ? '启用' : '禁用'}

协同模式:
  当前模式: ${state.mode}
  模式原因: ${state.modeReason}
  持续时间: ${modeHours.toFixed(1)} 小时

决策统计:
  DCA 决策: ${state.dcaDecisions}
  网格决策: ${state.gridDecisions}
  风险决策: ${state.riskDecisions}
  总决策数: ${state.dcaDecisions + state.gridDecisions + state.riskDecisions}

上次决策:
  时间: ${state.lastDecisionTime === 0 ? '无' : new Date(state.lastDecisionTime).toLocaleString()}
  类型: ${state.lastDecision?.type || '无'}
  动作: ${state.lastDecision?.action || '无'}
  原因: ${state.lastDecision?.reason || '无'}
    `.trim();
  }
}

// 导出别名，与 index.ts 保持一致
export { StrategyCoordinator as Coordinator };
