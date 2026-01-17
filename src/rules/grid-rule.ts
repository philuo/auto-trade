/**
 * 网格交易规则
 *
 * 在指定价格区间内设置网格，低买高卖
 */

import { logger } from '../utils/logger;
import { BaseRule } from './base-rule;
import type {
  GridRuleConfig,
  GridState,
  GridOrder,
  RuleEngineInput,
  RuleSignal,
  PriceData,
} from './types;
import { SignalStrength } from './types;

/**
 * 网格交易规则类
 */
export class GridRule extends BaseRule<GridRuleConfig> {
  // 网格状态存储
  private state: GridState;
  // 网格价格线
  private gridLines: number[] = [];

  constructor(config: GridRuleConfig) {
    super(config, 'grid' as any);
    this.state = this.initializeState();
    this.calculateGridLines();
  }

  // =====================================================
  // 状态管理
  // =====================================================

  /**
   * 初始化网格状态
   */
  private initializeState(): GridState {
    return {
      coin: this.config.coin,
      currentPrice: 0,
      gridOrders: [],
      realizedPnL: 0,
      positionPnL: 0,
    };
  }

  /**
   * 计算网格价格线
   */
  private calculateGridLines(): void {
    const { lowerPrice, upperPrice, gridCount } = this.config;
    const step = (upperPrice - lowerPrice) / gridCount;

    this.gridLines = [];
    for (let i = 0; i <= gridCount; i++) {
      this.gridLines.push(lowerPrice + step * i);
    }

    logger.info(`网格价格线已计算 [${this.config.coin}]`, {
      gridCount: gridCount + 1,
      lowerPrice,
      upperPrice,
      step: step.toFixed(2),
    });
  }

  /**
   * 获取网格状态
   */
  getState(): GridState {
    return { ...this.state };
  }

  /**
   * 更新网格价格
   */
  private updateGridPrice(price: number): void {
    this.state.currentPrice = price;
  }

  // =====================================================
  // 订单管理
  // =====================================================

  /**
   * 创建网格订单
   */
  private createGridOrder(side: 'buy' | 'sell', price: number, amount: number): GridOrder {
    return {
      orderId: `grid-${this.config.coin}-${side}-${price}-${Date.now()}`,
      side,
      price,
      amount,
      status: 'pending',
      createdAt: Date.now(),
    };
  }

  /**
   * 查找当前价格附近的网格订单
   */
  private findNearbyOrders(price: number, threshold: number = 0.01): GridOrder[] {
    return this.state.gridOrders.filter(order => {
      if (order.status !== 'pending') return false;
      const priceDiff = Math.abs(order.price - price) / price;
      return priceDiff < threshold;
    });
  }

  /**
   * 更新订单状态（模拟成交）
   */
  updateOrderStatus(orderId: string, status: 'filled' | 'cancelled'): void {
    const order = this.state.gridOrders.find(o => o.orderId === orderId);
    if (order) {
      order.status = status;

      // 如果成交，计算盈亏
      if (status === 'filled') {
        if (order.side === 'sell') {
          // 卢单成交，计算盈利
          const buyOrder = this.state.gridOrders.find(
            o => o.side === 'buy' && o.status === 'filled' && Math.abs(o.price - order.price) < 0.01
          );
          if (buyOrder) {
            const profit = (order.price - buyOrder.price) * order.amount;
            this.state.realizedPnL += profit;
            logger.info(`网格交易盈利 [${this.config.coin}]`, {
              buyPrice: buyOrder.price,
              sellPrice: order.price,
              amount: order.amount,
              profit: profit.toFixed(2),
            });
          }
        }
      }
    }
  }

  // =====================================================
  // 信号生成
  // =====================================================

  /**
   * 生成网格交易信号
   */
  generateSignal(input: RuleEngineInput): RuleSignal | RuleSignal[] | null {
    if (!this.isEnabled()) {
      return null;
    }

    const priceData = this.getPriceData(this.config.coin, input.prices);
    if (!priceData) {
      logger.debug(`未找到价格数据: ${this.config.coin}`);
      return null;
    }

    const price = priceData.price;
    this.updateGridPrice(price);

    // 检查价格是否在网格范围内
    if (price < this.config.lowerPrice || price > this.config.upperPrice) {
      logger.debug(`价格 ${price} 超出网格范围 [${this.config.lowerPrice}, ${this.config.upperPrice}]`);
      return null;
    }

    const signals: RuleSignal[] = [];

    // 检查是否需要创建买单
    const buySignal = this.checkBuySignal(price, priceData);
    if (buySignal) {
      signals.push(buySignal);
    }

    // 检查是否需要创建卖单
    const sellSignal = this.checkSellSignal(price, priceData);
    if (sellSignal) {
      signals.push(sellSignal);
    }

    return signals.length > 0 ? signals : null;
  }

  /**
   * 检查买入信号
   */
  private checkBuySignal(price: number, priceData: PriceData): RuleSignal | null {
    // 找到当前价格所在的网格区间
    let lowerGrid = 0;
    let upperGrid = 0;

    for (let i = 0; i < this.gridLines.length - 1; i++) {
      if (price >= this.gridLines[i] && price < this.gridLines[i + 1]) {
        lowerGrid = this.gridLines[i];
        upperGrid = this.gridLines[i + 1];
        break;
      }
    }

    // 如果价格接近下网格线，创建买单
    const buyThreshold = 0.005; // 0.5% 阈值
    if (Math.abs(price - lowerGrid) / lowerGrid < buyThreshold) {
      // 检查是否已有相同价格的买单
      const existingBuyOrder = this.state.gridOrders.find(
        o => o.side === 'buy' && o.status === 'pending' && Math.abs(o.price - lowerGrid) < 0.01
      );

      if (!existingBuyOrder) {
        const amount = this.config.investmentPerGrid / lowerGrid;

        const signal = this.createBuySignal({
          coin: this.config.coin,
          reason: `网格买入: 价格接近下网格线 ${lowerGrid.toFixed(2)}`,
          confidence: 0.7,
          ruleScore: 0.5,
          strength: SignalStrength.MODERATE,
          suggestedPrice: lowerGrid,
          suggestedAmount: this.config.investmentPerGrid,
        });

        // 创建网格订单
        const order = this.createGridOrder('buy', lowerGrid, amount);
        this.state.gridOrders.push(order);

        logger.debug(`网格买入信号 [${this.config.coin}]`, {
          price: lowerGrid,
          amount: amount.toFixed(6),
          investment: this.config.investmentPerGrid,
        });

        return signal;
      }
    }

    return null;
  }

  /**
   * 检查卖出信号
   */
  private checkSellSignal(price: number, priceData: PriceData): RuleSignal | null {
    // 找到当前价格所在的网格区间
    let lowerGrid = 0;
    let upperGrid = 0;

    for (let i = 0; i < this.gridLines.length - 1; i++) {
      if (price >= this.gridLines[i] && price < this.gridLines[i + 1]) {
        lowerGrid = this.gridLines[i];
        upperGrid = this.gridLines[i + 1];
        break;
      }
    }

    // 如果价格接近上网格线，且有持仓，创建卖单
    const sellThreshold = 0.005; // 0.5% 阈值
    if (Math.abs(price - upperGrid) / upperGrid < sellThreshold) {
      // 检查是否已有相同价格的卖单
      const existingSellOrder = this.state.gridOrders.find(
        o => o.side === 'sell' && o.status === 'pending' && Math.abs(o.price - upperGrid) < 0.01
      );

      // 检查是否有可卖持仓（查找已成交的买单）
      const hasBoughtPosition = this.state.gridOrders.some(
        o => o.side === 'buy' && o.status === 'filled' && o.price < upperGrid
      );

      if (!existingSellOrder && hasBoughtPosition) {
        // 计算可卖出数量
        let totalBoughtAmount = 0;
        for (const order of this.state.gridOrders) {
          if (order.side === 'buy' && order.status === 'filled' && order.price < upperGrid) {
            totalBoughtAmount += order.amount;
          }
        }

        if (totalBoughtAmount > 0) {
          const signal = this.createSellSignal({
            coin: this.config.coin,
            reason: `网格卖出: 价格接近上网格线 ${upperGrid.toFixed(2)}`,
            confidence: 0.7,
            ruleScore: 0.5,
            strength: SignalStrength.MODERATE,
            suggestedPrice: upperGrid,
            suggestedAmount: totalBoughtAmount,
          });

          // 创建网格订单
          const order = this.createGridOrder('sell', upperGrid, totalBoughtAmount);
          this.state.gridOrders.push(order);

          logger.debug(`网格卖出信号 [${this.config.coin}]`, {
            price: upperGrid,
            amount: totalBoughtAmount.toFixed(6),
          });

          return signal;
        }
      }
    }

    return null;
  }

  // =====================================================
  // 工具方法
  // =====================================================

  /**
   * 获取网格统计信息
   */
  getGridStats(): {
    totalOrders: number;
    pendingOrders: number;
    filledOrders: number;
    realizedPnL: number;
    unrealizedPnL: number;
  } {
    const pendingOrders = this.state.gridOrders.filter(o => o.status === 'pending').length;
    const filledOrders = this.state.gridOrders.filter(o => o.status === 'filled').length;

    return {
      totalOrders: this.state.gridOrders.length,
      pendingOrders,
      filledOrders,
      realizedPnL: this.state.realizedPnL,
      unrealizedPnL: this.state.positionPnL,
    };
  }

  /**
   * 重置网格状态
   */
  resetState(): void {
    this.state = this.initializeState();
    this.gridLines = [];
    this.calculateGridLines();
    logger.info(`网格状态已重置 [${this.config.coin}]`);
  }

  /**
   * 更新网格配置
   */
  updateConfig(config: Partial<GridRuleConfig>): void {
    super.updateConfig(config);

    // 如果网格参数变化，重新计算网格线
    if (
      config.lowerPrice !== undefined ||
      config.upperPrice !== undefined ||
      config.gridCount !== undefined
    ) {
      this.calculateGridLines();
    }
  }
}
