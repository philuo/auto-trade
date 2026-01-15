/**
 * 网格交易策略引擎
 *
 * 功能：
 * - 在价格区间内等距/几何放置网格订单
 * - 自动处理订单成交
 * - 动态调整网格区间
 * - 智能再平衡
 */

import type {
  AllowedCoin,
  GridConfig,
  GridLine,
  GridState,
  Decision
} from '../config/strategy-config';
import type {
  PriceRange,
  MarketData,
  CoinPosition,
  StrategyOrder
} from '../config/types';

// =====================================================
// 网格引擎状态
// =====================================================

/**
 * 币种网格状态
 */
interface GridCoinState {
  coin: AllowedCoin;
  enabled: boolean;

  // 价格区间
  upperPrice: number;
  lowerPrice: number;
  currentPrice: number;

  // 网格配置
  gridCount: number;
  spacingMode: 'equal' | 'geometric';
  geometricRatio: number;

  // 网格线
  grids: GridLine[];

  // 活跃订单
  activeOrders: Map<string, GridLine>;

  // 统计
  totalBuyOrders: number;
  totalSellOrders: number;
  totalBuyValue: number;
  totalSellValue: number;
  realizedProfit: number;

  // 时间
  lastRebalance: number;
  createdAt: number;
}

// =====================================================
// 网格引擎类
// =====================================================

export class GridEngine {
  private config: GridConfig;
  private states: Map<AllowedCoin, GridCoinState> = new Map();

  constructor(config: GridConfig) {
    this.config = config;
  }

  /**
   * 初始化币种的网格状态
   */
  initializeCoin(coin: AllowedCoin, currentPrice: number, priceRange?: PriceRange): void {
    if (!this.config.enabled) {
      return;
    }

    // 计算价格区间
    const upperPrice = priceRange?.upper || currentPrice * (1 + this.config.rangeCalculation.upperRange / 100);
    const lowerPrice = priceRange?.lower || currentPrice * (1 - this.config.rangeCalculation.lowerRange / 100);

    // 计算网格线
    const grids = this.calculateGrids(currentPrice, lowerPrice, upperPrice);

    const state: GridCoinState = {
      coin,
      enabled: true,
      upperPrice,
      lowerPrice,
      currentPrice,
      gridCount: this.config.gridSettings.gridCount,
      spacingMode: this.config.gridSettings.spacing,
      geometricRatio: this.config.gridSettings.geometricRatio,
      grids,
      activeOrders: new Map(),
      totalBuyOrders: 0,
      totalSellOrders: 0,
      totalBuyValue: 0,
      totalSellValue: 0,
      realizedProfit: 0,
      lastRebalance: Date.now(),
      createdAt: Date.now()
    };

    this.states.set(coin, state);
  }

  /**
   * 计算网格线
   */
  private calculateGrids(currentPrice: number, lowerPrice: number, upperPrice: number): GridLine[] {
    const grids: GridLine[] = [];
    const { gridCount, spacing, geometricRatio } = this.config.gridSettings;

    if (spacing === 'equal') {
      // 等间距网格
      const step = (upperPrice - lowerPrice) / (gridCount - 1);

      for (let i = 0; i < gridCount; i++) {
        const price = lowerPrice + step * i;
        const type = i < gridCount / 2 ? 'buy' : 'sell';

        grids.push({
          price,
          type,
          executed: false,
          orderId: null
        });
      }
    } else {
      // 几何网格（对数间距）
      const logUpper = Math.log(upperPrice);
      const logLower = Math.log(lowerPrice);
      const logStep = (logUpper - logLower) / (gridCount - 1);

      for (let i = 0; i < gridCount; i++) {
        const price = Math.exp(logLower + logStep * i);
        const type = i < gridCount / 2 ? 'buy' : 'sell';

        grids.push({
          price,
          type,
          executed: false,
          orderId: null
        });
      }
    }

    return grids;
  }

  /**
   * 获取待下单的网格订单
   */
  getPendingGridOrders(coin: AllowedCoin): GridLine[] {
    const state = this.states.get(coin);
    if (!state || !state.enabled) {
      return [];
    }

    return state.grids.filter(grid => !grid.executed && grid.orderId === null);
  }

  /**
   * 更新网格订单 ID
   */
  updateGridOrderId(coin: AllowedCoin, gridIndex: number, orderId: string): void {
    const state = this.states.get(coin);
    if (!state || gridIndex < 0 || gridIndex >= state.grids.length) {
      return;
    }

    const grid = state.grids[gridIndex];
    if (grid) {
      grid.orderId = orderId;
      state.activeOrders.set(orderId, grid);
    }
  }

  /**
   * 处理订单成交
   */
  async handleOrderFill(coin: AllowedCoin, orderId: string, fillPrice: number): Promise<void> {
    const state = this.states.get(coin);
    if (!state) {
      return;
    }

    const grid = state.activeOrders.get(orderId);
    if (!grid) {
      return;
    }

    // 标记为已成交
    grid.executed = true;
    grid.orderId = null;
    state.activeOrders.delete(orderId);

    // 更新统计
    if (grid.type === 'buy') {
      state.totalBuyOrders++;
      state.totalBuyValue += fillPrice * this.calculateOrderSize(fillPrice, state);
    } else {
      state.totalSellOrders++;
      state.totalSellValue += fillPrice * this.calculateOrderSize(fillPrice, state);
    }

    // 触发对应的反向订单
    await this.placeCounterOrder(coin, grid, state);
  }

  /**
   * 放置反向订单
   */
  private async placeCounterOrder(coin: AllowedCoin, executedGrid: GridLine, state: GridCoinState): Promise<void> {
    // 找到成交的网格索引
    const executedIndex = state.grids.findIndex(g => g.price === executedGrid.price);
    if (executedIndex === -1) {
      return;
    }

    if (executedGrid.type === 'buy') {
      // 买单成交，在更高价格挂卖单
      const sellIndex = this.findNextSellGrid(executedIndex, state);
      if (sellIndex !== -1) {
        const sellGrid = state.grids[sellIndex];
        if (sellGrid && !sellGrid.executed) {
          // 标记为待下单（实际下单由订单管理器处理）
          sellGrid.orderId = 'pending_' + Date.now();
        }
      }
    } else {
      // 卖单成交，在更低价格挂买单
      const buyIndex = this.findNextBuyGrid(executedIndex, state);
      if (buyIndex !== -1) {
        const buyGrid = state.grids[buyIndex];
        if (buyGrid && !buyGrid.executed) {
          buyGrid.orderId = 'pending_' + Date.now();
        }
      }
    }
  }

  /**
   * 查找下一个卖单网格
   */
  private findNextSellGrid(buyIndex: number, state: GridCoinState): number {
    // 从当前索引向上查找第一个未执行的卖单
    for (let i = buyIndex + 1; i < state.grids.length; i++) {
      const grid = state.grids[i];
      if (grid && grid.type === 'sell' && !grid.executed) {
        return i;
      }
    }
    return -1;
  }

  /**
   * 查找下一个买单网格
   */
  private findNextBuyGrid(sellIndex: number, state: GridCoinState): number {
    // 从当前索引向下查找第一个未执行的买单
    for (let i = sellIndex - 1; i >= 0; i--) {
      const grid = state.grids[i];
      if (grid && grid.type === 'buy' && !grid.executed) {
        return i;
      }
    }
    return -1;
  }

  /**
   * 计算订单大小
   */
  private calculateOrderSize(price: number, state: GridCoinState): number {
    const { size, sizeType, percentage } = this.config.orderSettings;

    if (sizeType === 'fixed') {
      return size / price;
    } else {
      // 按百分比计算（需要总持仓价值）
      // 这里简化处理，实际应该传入总价值
      return size / price;
    }
  }

  /**
   * 检查是否需要调整价格区间
   */
  async shouldAdjustRange(coin: AllowedCoin, priceRange: PriceRange): Promise<boolean> {
    const state = this.states.get(coin);
    if (!state || !this.config.rangeCalculation.adjustOnBreakout) {
      return false;
    }

    const currentPrice = state.currentPrice;
    const breakoutThreshold = 0.95;

    // 检查是否接近边界
    const nearUpper = currentPrice >= state.upperPrice * breakoutThreshold;
    const nearLower = currentPrice <= state.lowerPrice * (2 - breakoutThreshold);

    return nearUpper || nearLower;
  }

  /**
   * 重新平衡网格
   */
  async rebalanceGrids(coin: AllowedCoin, newPriceRange?: PriceRange): Promise<void> {
    const state = this.states.get(coin);
    if (!state) {
      return;
    }

    // 取消所有活跃订单
    state.activeOrders.clear();
    state.grids.forEach(grid => {
      if (!grid.executed) {
        grid.orderId = null;
      }
    });

    // 更新价格区间
    if (newPriceRange) {
      state.upperPrice = newPriceRange.upper;
      state.lowerPrice = newPriceRange.lower;
    } else {
      // 基于当前价格重新计算区间
      state.upperPrice = state.currentPrice * (1 + this.config.rangeCalculation.upperRange / 100);
      state.lowerPrice = state.currentPrice * (1 - this.config.rangeCalculation.lowerRange / 100);
    }

    // 重新计算网格线（保留已执行的）
    const newGrids = this.calculateGrids(state.currentPrice, state.lowerPrice, state.upperPrice);

    // 保留已执行的网格状态
    state.grids = newGrids.map((newGrid, i) => {
      const existingGrid = state.grids.find(g =>
        Math.abs(g.price - newGrid.price) / g.price < 0.01 && g.type === newGrid.type
      );
      return existingGrid || newGrid;
    });

    state.lastRebalance = Date.now();
  }

  /**
   * 更新当前价格
   */
  async updatePrice(coin: AllowedCoin, price: number): Promise<void> {
    const state = this.states.get(coin);
    if (!state) {
      return;
    }

    state.currentPrice = price;

    // 检查是否需要自动再平衡
    if (this.config.behavior.rebalanceMode === 'immediate') {
      const shouldRebalance = await this.shouldAdjustRange(coin, {
        lower: state.lowerPrice,
        upper: state.upperPrice,
        current: price,
        width: 0,
        volatility: 0,
        confidence: 0,
        lastUpdated: Date.now()
      });

      if (shouldRebalance) {
        await this.rebalanceGrids(coin);
      }
    }
  }

  /**
   * 获取网格统计信息
   */
  getGridStats(coin: AllowedCoin): {
    totalBuyOrders: number;
    totalSellOrders: number;
    totalBuyValue: number;
    totalSellValue: number;
    realizedProfit: number;
    gridCoverage: number;
  } | null {
    const state = this.states.get(coin);
    if (!state) {
      return null;
    }

    const executedGrids = state.grids.filter(g => g.executed);
    const gridCoverage = executedGrids.length / state.grids.length;

    return {
      totalBuyOrders: state.totalBuyOrders,
      totalSellOrders: state.totalSellOrders,
      totalBuyValue: state.totalBuyValue,
      totalSellValue: state.totalSellValue,
      realizedProfit: state.totalSellValue - state.totalBuyValue,
      gridCoverage
    };
  }

  /**
   * 获取币种状态
   */
  getCoinState(coin: AllowedCoin): GridCoinState | undefined {
    return this.states.get(coin);
  }

  /**
   * 获取所有状态
   */
  getAllStates(): Map<AllowedCoin, GridCoinState> {
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
   * 更新配置
   */
  updateConfig(config: Partial<GridConfig>): void {
    this.config = {
      ...this.config,
      rangeCalculation: { ...this.config.rangeCalculation, ...config.rangeCalculation },
      gridSettings: { ...this.config.gridSettings, ...config.gridSettings },
      orderSettings: { ...this.config.orderSettings, ...config.orderSettings },
      behavior: { ...this.config.behavior, ...config.behavior }
    };
  }

  /**
   * 获取配置
   */
  getConfig(): GridConfig {
    return { ...this.config };
  }

  /**
   * 生成状态报告
   */
  generateReport(coin: AllowedCoin): string {
    const state = this.states.get(coin);
    if (!state) {
      return `网格: ${coin} 未初始化`;
    }

    const stats = this.getGridStats(coin);
    const activeOrders = state.grids.filter(g => !g.executed && g.orderId !== null).length;
    const pendingOrders = state.grids.filter(g => !g.executed && g.orderId === null).length;
    const executedOrders = state.grids.filter(g => g.executed).length;

    return `
网格状态报告: ${coin}
========================
启用状态: ${state.enabled ? '启用' : '禁用'}

价格区间:
  上限: ${state.upperPrice.toFixed(2)}
  下限: ${state.lowerPrice.toFixed(2)}
  当前: ${state.currentPrice.toFixed(2)}
  宽度: ${((state.upperPrice - state.lowerPrice) / state.currentPrice * 100).toFixed(2)}%

网格配置:
  网格数量: ${state.gridCount}
  间距模式: ${state.spacingMode}
  几何比例: ${state.geometricRatio}

订单状态:
  待下单: ${pendingOrders}
  活跃订单: ${activeOrders}
  已成交: ${executedOrders}

交易统计:
  买单次数: ${stats?.totalBuyOrders || 0}
  卖单次数: ${stats?.totalSellOrders || 0}
  买入总额: ${stats?.totalBuyValue.toFixed(2) || 0} USDT
  卖出总额: ${stats?.totalSellValue.toFixed(2) || 0} USDT
  已实现盈亏: ${stats?.realizedProfit.toFixed(2) || 0} USDT
  网格覆盖率: ${((stats?.gridCoverage || 0) * 100).toFixed(1)}%

上次再平衡: ${new Date(state.lastRebalance).toLocaleString()}
    `.trim();
  }
}
