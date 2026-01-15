/**
 * 订单追踪器
 *
 * 功能：
 * - 跟踪订单状态变化
 * - 处理订单成交事件
 * - 维护订单历史记录
 * - 通知策略引擎订单状态更新
 */

import type { AllowedCoin } from '../config/strategy-config';
import type {
  StrategyOrder,
  OrderSide,
  OrderStatus
} from '../config/types';

// =====================================================
// 订单追踪状态
// =====================================================

export interface TrackedOrder {
  // 基本信息
  id: string;                   // OKX 订单 ID
  clientOrderId: string;        // 客户端订单 ID
  coin: AllowedCoin;
  symbol: string;
  side: OrderSide;
  type: string;
  strategy: 'dca' | 'grid' | 'manual';

  // 订单参数
  price: number;
  size: number;
  filledSize: number;
  avgFillPrice: number;

  // 状态信息
  status: OrderStatus;
  createdAt: number;
  updatedAt: number;
  filledAt?: number;
  cancelledAt?: number;

  // 策略信息
  metadata: Record<string, unknown>;

  // 事件回调
  onFill?: (order: TrackedOrder) => void;
  onCancel?: (order: TrackedOrder) => void;
  onUpdate?: (order: TrackedOrder) => void;
}

// =====================================================
// 订单追踪统计
// =====================================================

export interface OrderTrackingStats {
  totalOrders: number;
  activeOrders: number;
  filledOrders: number;
  cancelledOrders: number;
  failedOrders: number;
  totalValue: number;
  filledValue: number;
}

// =====================================================
// 订单追踪器类
// =====================================================

export class OrderTracker {
  private okxApi: any;
  private trackedOrders: Map<string, TrackedOrder> = new Map();
  private clientOrderIndex: Map<string, TrackedOrder> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;
  private updateFrequency: number = 1000; // 1秒更新一次

  constructor(okxApi: any, updateFrequency: number = 1000) {
    this.okxApi = okxApi;
    this.updateFrequency = updateFrequency;
  }

  /**
   * 启动追踪
   */
  start(): void {
    if (this.updateInterval) {
      return; // 已启动
    }

    console.log('[OrderTracker] 启动订单追踪...');

    this.updateInterval = setInterval(async () => {
      await this.updateAllOrders();
    }, this.updateFrequency);
  }

  /**
   * 停止追踪
   */
  stop(): void {
    if (!this.updateInterval) {
      return;
    }

    console.log('[OrderTracker] 停止订单追踪...');

    clearInterval(this.updateInterval);
    this.updateInterval = null;
  }

  /**
   * 添加订单到追踪
   */
  trackOrder(order: Partial<TrackedOrder>): void {
    if (!order.id || !order.clientOrderId) {
      console.error('[OrderTracker] 订单 ID 或客户端订单 ID 不能为空');
      return;
    }

    if (!order.coin || !order.side || !order.type) {
      console.error('[OrderTracker] 订单缺少必需字段');
      return;
    }

    const trackedOrder: TrackedOrder = {
      id: order.id,
      clientOrderId: order.clientOrderId,
      coin: order.coin,
      symbol: order.symbol || `${order.coin}-USDT`,
      side: order.side,
      type: order.type,
      strategy: order.strategy || 'manual',
      price: order.price || 0,
      size: order.size || 0,
      filledSize: order.filledSize || 0,
      avgFillPrice: order.avgFillPrice || 0,
      status: order.status || 'live',
      createdAt: order.createdAt || Date.now(),
      updatedAt: order.updatedAt || Date.now(),
      metadata: order.metadata || {}
    };

    this.trackedOrders.set(order.id, trackedOrder);
    this.clientOrderIndex.set(order.clientOrderId, trackedOrder);

    console.log(`[OrderTracker] 开始追踪订单: ${order.clientOrderId} (${order.symbol} ${order.side})`);
  }

  /**
   * 更新所有订单状态
   */
  private async updateAllOrders(): Promise<void> {
    if (this.trackedOrders.size === 0) {
      return;
    }

    // 获取所有未完成的订单
    const activeOrders = Array.from(this.trackedOrders.values()).filter(
      order => order.status === 'live' || order.status === 'partially_filled'
    );

    if (activeOrders.length === 0) {
      return;
    }

    // 批量查询订单状态
    for (const order of activeOrders) {
      try {
        await this.updateOrderStatus(order.id);
      } catch (error) {
        console.error(`[OrderTracker] 更新订单状态失败 (${order.id}):`, error);
      }
    }
  }

  /**
   * 更新单个订单状态
   */
  private async updateOrderStatus(orderId: string): Promise<void> {
    const order = this.trackedOrders.get(orderId);
    if (!order) {
      return;
    }

    try {
      // 从 OKX API 获取订单详情
      const orderDetail = await this.okxApi.getOrder({
        instId: order.symbol,
        ordId: orderId
      });

      if (!orderDetail || orderDetail.length === 0) {
        console.warn(`[OrderTracker] 未找到订单: ${orderId}`);
        return;
      }

      const detail = orderDetail[0];
      const newStatus: OrderStatus = detail.state;
      const oldStatus = order.status;

      // 更新订单信息
      order.status = newStatus;
      order.filledSize = parseFloat(detail.fillSz || '0');
      order.avgFillPrice = parseFloat(detail.avgPx || '0');
      order.updatedAt = Date.now();

      // 处理状态变化
      if (newStatus !== oldStatus) {
        await this.handleStatusChange(order, oldStatus, newStatus);
      }

      // 触发更新回调
      if (order.onUpdate) {
        order.onUpdate(order);
      }
    } catch (error) {
      console.error(`[OrderTracker] 更新订单状态失败 (${orderId}):`, error);
    }
  }

  /**
   * 处理订单状态变化
   */
  private async handleStatusChange(
    order: TrackedOrder,
    oldStatus: OrderStatus,
    newStatus: OrderStatus
  ): Promise<void> {
    console.log(`[OrderTracker] 订单状态变化: ${order.clientOrderId} ${oldStatus} -> ${newStatus}`);

    switch (newStatus) {
      case 'filled':
        order.filledAt = Date.now();
        await this.handleOrderFilled(order);
        break;

      case 'canceled':
        order.cancelledAt = Date.now();
        await this.handleOrderCanceled(order);
        break;

      case 'partially_filled':
        // 部分成交，不需要特殊处理
        break;

      case 'live':
        // 订单重新激活
        break;

      default:
        console.warn(`[OrderTracker] 未知订单状态: ${newStatus}`);
    }
  }

  /**
   * 处理订单成交
   */
  private async handleOrderFilled(order: TrackedOrder): Promise<void> {
    console.log(`[OrderTracker] 订单成交: ${order.clientOrderId}`);
    console.log(`  - 币种: ${order.coin}`);
    console.log(`  - 方向: ${order.side}`);
    console.log(`  - 价格: ${order.avgFillPrice}`);
    console.log(`  - 数量: ${order.filledSize}`);
    console.log(`  - 价值: ${(order.filledSize * order.avgFillPrice).toFixed(2)} USDT`);

    // 触发成交回调
    if (order.onFill) {
      order.onFill(order);
    }

    // 从活跃追踪中移除
    // this.trackedOrders.delete(order.id);
    // this.clientOrderIndex.delete(order.clientOrderId);
  }

  /**
   * 处理订单取消
   */
  private async handleOrderCanceled(order: TrackedOrder): Promise<void> {
    console.log(`[OrderTracker] 订单取消: ${order.clientOrderId}`);

    // 触发取消回调
    if (order.onCancel) {
      order.onCancel(order);
    }

    // 从活跃追踪中移除
    // this.trackedOrders.delete(order.id);
    // this.clientOrderIndex.delete(order.clientOrderId);
  }

  /**
   * 根据订单 ID 获取订单
   */
  getOrder(orderId: string): TrackedOrder | undefined {
    return this.trackedOrders.get(orderId);
  }

  /**
   * 根据客户端订单 ID 获取订单
   */
  getOrderByClientOrderId(clientOrderId: string): TrackedOrder | undefined {
    return this.clientOrderIndex.get(clientOrderId);
  }

  /**
   * 获取所有追踪中的订单
   */
  getAllOrders(): TrackedOrder[] {
    return Array.from(this.trackedOrders.values());
  }

  /**
   * 获取活跃订单
   */
  getActiveOrders(): TrackedOrder[] {
    return this.getAllOrders().filter(
      order => order.status === 'live' || order.status === 'partially_filled'
    );
  }

  /**
   * 获取已完成的订单
   */
  getCompletedOrders(): TrackedOrder[] {
    return this.getAllOrders().filter(
      order => order.status === 'filled' || order.status === 'canceled'
    );
  }

  /**
   * 获取币种的活跃订单
   */
  getActiveOrdersForCoin(coin: AllowedCoin): TrackedOrder[] {
    return this.getActiveOrders().filter(order => order.coin === coin);
  }

  /**
   * 获取统计信息
   */
  getStats(): OrderTrackingStats {
    const orders = this.getAllOrders();
    const activeOrders = orders.filter(o => o.status === 'live' || o.status === 'partially_filled');
    const filledOrders = orders.filter(o => o.status === 'filled');
    const cancelledOrders = orders.filter(o => o.status === 'canceled');

    const totalValue = orders.reduce((sum, o) => sum + (o.size * o.price), 0);
    const filledValue = filledOrders.reduce((sum, o) => sum + (o.filledSize * o.avgFillPrice), 0);

    return {
      totalOrders: orders.length,
      activeOrders: activeOrders.length,
      filledOrders: filledOrders.length,
      cancelledOrders: cancelledOrders.length,
      failedOrders: 0, // TODO: 实现失败订单检测
      totalValue,
      filledValue
    };
  }

  /**
   * 清理已完成的订单
   */
  cleanupCompletedOrders(olderThan?: number): void {
    const now = Date.now();
    const maxAge = olderThan || 24 * 60 * 60 * 1000; // 默认24小时

    const toDelete: string[] = [];

    for (const [orderId, order] of this.trackedOrders) {
      if (order.status === 'filled' || order.status === 'canceled') {
        const age = order.filledAt || order.cancelledAt || order.updatedAt;

        if (now - age > maxAge) {
          toDelete.push(orderId);
        }
      }
    }

    for (const orderId of toDelete) {
      const order = this.trackedOrders.get(orderId);
      if (order) {
        this.clientOrderIndex.delete(order.clientOrderId);
        this.trackedOrders.delete(orderId);
      }
    }

    if (toDelete.length > 0) {
      console.log(`[OrderTracker] 清理了 ${toDelete.length} 个旧订单`);
    }
  }

  /**
   * 取消订单
   */
  async cancelOrder(orderId: string): Promise<boolean> {
    const order = this.trackedOrders.get(orderId);
    if (!order) {
      console.warn(`[OrderTracker] 未找到订单: ${orderId}`);
      return false;
    }

    if (order.status !== 'live' && order.status !== 'partially_filled') {
      console.warn(`[OrderTracker] 订单状态不是活跃状态: ${order.status}`);
      return false;
    }

    try {
      await this.okxApi.cancelOrder({
        instId: order.symbol,
        ordId: orderId
      });

      console.log(`[OrderTracker] 已发送取消请求: ${order.clientOrderId}`);
      return true;
    } catch (error) {
      console.error(`[OrderTracker] 取消订单失败 (${orderId}):`, error);
      return false;
    }
  }

  /**
   * 批量取消订单
   */
  async cancelOrders(orderIds: string[]): Promise<{ success: string[]; failed: string[] }> {
    const success: string[] = [];
    const failed: string[] = [];

    for (const orderId of orderIds) {
      const result = await this.cancelOrder(orderId);
      if (result) {
        success.push(orderId);
      } else {
        failed.push(orderId);
      }
    }

    return { success, failed };
  }

  /**
   * 生成状态报告
   */
  generateReport(): string {
    const stats = this.getStats();
    const activeOrders = this.getActiveOrders();

    let report = `
订单追踪报告
========================
总订单数: ${stats.totalOrders}
活跃订单: ${stats.activeOrders}
已成交: ${stats.filledOrders}
已取消: ${stats.cancelledOrders}

订单价值:
  总价值: ${stats.totalValue.toFixed(2)} USDT
  已成交价值: ${stats.filledValue.toFixed(2)} USDT
`;

    if (activeOrders.length > 0) {
      report += `\n活跃订单:\n`;
      for (const order of activeOrders) {
        report += `  ${order.clientOrderId}\n`;
        report += `    - ${order.symbol} ${order.side}\n`;
        report += `    - 价格: ${order.price}\n`;
        report += `    - 数量: ${order.size}\n`;
        report += `    - 已成交: ${order.filledSize}\n`;
        report += `    - 状态: ${order.status}\n`;
      }
    }

    return report.trim();
  }
}
