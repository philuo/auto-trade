/**
 * 中性合约网格引擎
 *
 * 核心功能：
 * - 管理双向网格订单（做多+做空）
 * - 价格区间动态调整
 * - 仓位平衡管理
 * - 手续费优化（优先使用 Maker 订单）
 */

import type {
  SwapAllowedCoin,
  NeutralGridConfigOptions,
  CoinGridState,
  GridOrder,
  SwapMarketData,
  NeutralGridDecision
} from '../config/types';

// =====================================================
// 网格层级定义
// =====================================================

export interface GridLevel {
  level: number;                  // 层级编号（负数为做空，正数为做多）
  price: number;                  // 网格价格
  side: 'buy' | 'sell';           // 订单方向
  type: 'long' | 'short';         // 仓位类型
  size: number;                   // 订单大小
  order?: GridOrder;              // 关联的订单
}

// =====================================================
// 中性网格引擎类
// =====================================================

export class NeutralGridEngine {
  private config: NeutralGridConfigOptions;
  private coinStates: Map<SwapAllowedCoin, CoinGridState> = new Map();

  constructor(config: NeutralGridConfigOptions) {
    this.config = config;
  }

  /**
   * 初始化币种
   */
  initializeCoin(coin: SwapAllowedCoin, capital: number, currentPrice: number): void {
    const state: CoinGridState = {
      coin,
      enabled: true,
      allocatedCapital: capital,
      leverage: coin === 'BTC' ? 5 : 3,

      priceRange: {
        upper: currentPrice * (1 + this.config.rangeCalculation.upperRange / 100),
        lower: currentPrice * (1 - this.config.rangeCalculation.lowerRange / 100),
        center: currentPrice,
        lastUpdate: Date.now()
      },

      currentPrice,
      longPosition: {
        size: 0,
        value: 0,
        avgPrice: 0,
        unrealizedPnL: 0,
        liquidationPrice: 0
      },
      shortPosition: {
        size: 0,
        value: 0,
        avgPrice: 0,
        unrealizedPnL: 0,
        liquidationPrice: 0
      },
      gridOrders: [],
      totalTrades: 0,
      totalPnL: 0,
      fundingPaid: 0,
      fundingReceived: 0,
      lastRebalance: Date.now()
    };

    this.coinStates.set(coin, state);
  }

  /**
   * 生成网格层级
   */
  generateGridLevels(coin: SwapAllowedCoin): GridLevel[] {
    const state = this.coinStates.get(coin);
    if (!state) return [];

    const levels: GridLevel[] = [];
    const { gridCount, spacing, geometricRatio } = this.config.gridSettings;
    const { orderSettings } = this.config;
    const { upper, lower, center } = state.priceRange;

    // 计算每层订单大小
    const orderValue = orderSettings.sizeType === 'percentage'
      ? state.allocatedCapital * (orderSettings.size / 100)
      : orderSettings.size;

    const maxOrderSize = Math.min(orderValue, orderSettings.maxSizePerLevel);

    // 生成网格层级
    const halfGrids = Math.floor(gridCount / 2);

    if (spacing === 'geometric') {
      // 几何间距
      let price = center;

      // 生成做多网格（中心价下方）
      for (let i = 1; i <= halfGrids; i++) {
        price = center / Math.pow(geometricRatio, i);
        if (price < lower) break;

        levels.push({
          level: -i,
          price,
          side: 'buy',
          type: 'long',
          size: maxOrderSize
        });
      }

      // 生成做空网格（中心价上方）
      price = center;
      for (let i = 1; i <= halfGrids; i++) {
        price = center * Math.pow(geometricRatio, i);
        if (price > upper) break;

        levels.push({
          level: i,
          price,
          side: 'sell',
          type: 'short',
          size: maxOrderSize
        });
      }
    } else {
      // 算术间距
      const step = (upper - lower) / gridCount;

      // 中心下方的做多网格
      for (let i = 1; i <= halfGrids; i++) {
        const price = center - step * i;
        if (price < lower) break;

        levels.push({
          level: -i,
          price,
          side: 'buy',
          type: 'long',
          size: maxOrderSize
        });
      }

      // 中心上方的做空网格
      for (let i = 1; i <= halfGrids; i++) {
        const price = center + step * i;
        if (price > upper) break;

        levels.push({
          level: i,
          price,
          side: 'sell',
          type: 'short',
          size: maxOrderSize
        });
      }
    }

    return levels.sort((a, b) => a.price - b.price);
  }

  /**
   * 更新价格
   */
  updatePrice(coin: SwapAllowedCoin, price: number): void {
    const state = this.coinStates.get(coin);
    if (!state) return;

    state.currentPrice = price;

    // 更新未实现盈亏
    this.updateUnrealizedPnL(coin);
  }

  /**
   * 更新未实现盈亏
   */
  private updateUnrealizedPnL(coin: SwapAllowedCoin): void {
    const state = this.coinStates.get(coin);
    if (!state) return;

    const { currentPrice, longPosition, shortPosition } = state;

    // 多头盈亏
    if (longPosition.size > 0) {
      longPosition.unrealizedPnL =
        (currentPrice - longPosition.avgPrice) * longPosition.size;
    }

    // 空头盈亏（相反）
    if (shortPosition.size > 0) {
      shortPosition.unrealizedPnL =
        (shortPosition.avgPrice - currentPrice) * shortPosition.size;
    }
  }

  /**
   * 检查价格突破
   */
  checkBreakout(coin: SwapAllowedCoin): boolean {
    const state = this.coinStates.get(coin);
    if (!state) return false;

    const { currentPrice, priceRange } = state;

    return currentPrice >= priceRange.upper ||
           currentPrice <= priceRange.lower;
  }

  /**
   * 计算新的价格区间
   */
  calculateNewRange(coin: SwapAllowedCoin, marketData: SwapMarketData): void {
    const state = this.coinStates.get(coin);
    if (!state) return;

    const { currentPrice } = state;
    const { rangeCalculation } = this.config;

    let newCenter: number;

    switch (rangeCalculation.centerPrice) {
      case 'current':
        newCenter = currentPrice;
        break;
      case 'sma':
        // 简化处理：使用当前价格
        newCenter = currentPrice;
        break;
      case 'ema':
        // 简化处理：使用当前价格
        newCenter = currentPrice;
        break;
      default:
        newCenter = currentPrice;
    }

    state.priceRange = {
      upper: newCenter * (1 + rangeCalculation.upperRange / 100),
      lower: newCenter * (1 - rangeCalculation.lowerRange / 100),
      center: newCenter,
      lastUpdate: Date.now()
    };
  }

  /**
   * 生成交易决策
   */
  generateDecisions(
    coin: SwapAllowedCoin,
    marketData: SwapMarketData
  ): NeutralGridDecision[] {
    const decisions: NeutralGridDecision[] = [];
    const state = this.coinStates.get(coin);

    if (!state || !state.enabled) {
      return decisions;
    }

    // 1. 检查价格突破
    if (this.checkBreakout(coin)) {
      if (this.config.rangeCalculation.adjustOnBreakout) {
        this.calculateNewRange(coin, marketData);
        decisions.push({
          coin,
          action: 'rebalance',
          type: 'grid',
          reason: '价格突破区间，重新计算网格',
          timestamp: Date.now()
        });
      } else if (this.config.behavior.closeOnRangeBreak) {
        decisions.push({
          coin,
          action: 'pause',
          type: 'risk',
          reason: '价格突破网格区间',
          timestamp: Date.now()
        });
      }
    }

    // 2. 检查仓位平衡
    const balanceStatus = this.checkBalance(coin);
    if (balanceStatus.needsRebalance) {
      const now = Date.now();
      const hoursSinceRebalance = (now - state.lastRebalance) / (1000 * 60 * 60);

      if (hoursSinceRebalance >= this.config.balance.rebalanceInterval) {
        decisions.push({
          coin,
          action: 'rebalance',
          type: 'grid',
          reason: `仓位不平衡: ${balanceStatus.imbalance.toFixed(1)}%`,
          timestamp: now
        });
      }
    }

    // 3. 生成网格订单决策
    const gridLevels = this.generateGridLevels(coin);
    for (const level of gridLevels) {
      const existingOrder = state.gridOrders.find(o =>
        Math.abs(o.price - level.price) < 0.01 && o.type === level.type
      );

      if (!existingOrder) {
        decisions.push({
          coin,
          action: level.side === 'buy' ? 'open_long' : 'open_short',
          type: 'grid',
          reason: `网格层级 ${level.level}: ${level.price.toFixed(2)}`,
          size: level.size,
          price: level.price,
          timestamp: Date.now()
        });
      }
    }

    return decisions;
  }

  /**
   * 检查仓位平衡
   */
  private checkBalance(coin: SwapAllowedCoin): {
    needsRebalance: boolean;
    imbalance: number;
  } {
    const state = this.coinStates.get(coin);
    if (!state) {
      return { needsRebalance: false, imbalance: 0 };
    }

    const { longPosition, shortPosition } = state;

    if (longPosition.value === 0 && shortPosition.value === 0) {
      return { needsRebalance: false, imbalance: 0 };
    }

    const totalValue = longPosition.value + shortPosition.value;
    const imbalance = totalValue > 0
      ? Math.abs(longPosition.value - shortPosition.value) / totalValue * 100
      : 0;

    return {
      needsRebalance: imbalance > this.config.balance.threshold,
      imbalance
    };
  }

  /**
   * 执行再平衡
   */
  rebalance(coin: SwapAllowedCoin): void {
    const state = this.coinStates.get(coin);
    if (!state) return;

    state.lastRebalance = Date.now();
  }

  /**
   * 更新仓位（订单成交后调用）
   */
  updatePosition(
    coin: SwapAllowedCoin,
    type: 'long' | 'short',
    size: number,
    price: number,
    isOpen: boolean
  ): void {
    const state = this.coinStates.get(coin);
    if (!state) return;

    const position = type === 'long' ? state.longPosition : state.shortPosition;

    if (isOpen) {
      // 开仓
      if (position.size === 0) {
        position.avgPrice = price;
        position.size = size;
      } else {
        // 更新平均价格
        const totalValue = position.size * position.avgPrice + size * price;
        position.size += size;
        position.avgPrice = totalValue / position.size;
      }
      position.value = position.size * price;
    } else {
      // 平仓
      position.size -= size;
      if (position.size <= 0) {
        position.size = 0;
        position.avgPrice = 0;
        position.value = 0;
      } else {
        position.value = position.size * price;
      }
    }

    this.updateUnrealizedPnL(coin);
  }

  /**
   * 获取币种状态
   */
  getCoinState(coin: SwapAllowedCoin): CoinGridState | undefined {
    return this.coinStates.get(coin);
  }

  /**
   * 生成报告
   */
  generateReport(coin: SwapAllowedCoin): string {
    const state = this.coinStates.get(coin);
    if (!state) return `${coin}: 未初始化\n`;

    const balanceStatus = this.checkBalance(coin);

    let report = `
${coin} 中性网格状态
${'='.repeat(60)}
价格区间: ${state.priceRange.lower.toFixed(2)} - ${state.priceRange.upper.toFixed(2)}
当前价格: ${state.currentPrice.toFixed(2)}
区间中心: ${state.priceRange.center.toFixed(2)}

仓位情况:
  多头仓位: ${state.longPosition.size.toFixed(4)} 张 @ ${state.longPosition.avgPrice.toFixed(2)}
  多头价值: ${state.longPosition.value.toFixed(2)} USDT
  多头盈亏: ${state.longPosition.unrealizedPnL.toFixed(2)} USDT

  空头仓位: ${state.shortPosition.size.toFixed(4)} 张 @ ${state.shortPosition.avgPrice.toFixed(2)}
  空头价值: ${state.shortPosition.value.toFixed(2)} USDT
  空头盈亏: ${state.shortPosition.unrealizedPnL.toFixed(2)} USDT

  仓位平衡: ${balanceStatus.imbalance.toFixed(1)}% ${balanceStatus.needsRebalance ? '(需再平衡)' : '(平衡)'}

网格订单: ${state.gridOrders.length} 个

交易统计:
  总交易次数: ${state.totalTrades}
  总盈亏: ${state.totalPnL.toFixed(2)} USDT
  支付资金费: ${state.fundingPaid.toFixed(4)} USDT
  收取资金费: ${state.fundingReceived.toFixed(4)} USDT
  净资金费: ${(state.fundingReceived - state.fundingPaid).toFixed(4)} USDT
`;

    return report;
  }
}
