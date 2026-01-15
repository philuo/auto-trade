/**
 * 订单生成器
 *
 * 功能：
 * - 根据策略决策生成具体的订单
 * - 计算订单价格和数量
 * - 处理精度和最小交易单位
 * - 批量订单生成
 */

import type {
  AllowedCoin,
  Decision
} from '../config/strategy-config';
import type {
  OrderSide,
  OrderType
} from '../config/types';

// =====================================================
// 订单生成配置
// =====================================================

export interface OrderGeneratorConfig {
  okxApi: any;
  pricePrecision: number;        // 价格精度
  sizePrecision: number;         // 数量精度
  minOrderSize: number;          // 最小订单大小
  slippageTolerance: number;     // 滑点容忍度 (%)
}

// =====================================================
// 订单生成请求
// =====================================================

export interface GenerateOrderRequest {
  coin: AllowedCoin;
  side: OrderSide;
  type: OrderType;
  size?: number;                // USDT 价值
  price?: number;
  strategy: 'dca' | 'grid' | 'manual' | 'emergency' | 'risk';
}

export interface GenerateBatchOrderRequest {
  orders: GenerateOrderRequest[];
}

// =====================================================
// 订单生成结果
// =====================================================

export interface GeneratedOrder {
  symbol: string;
  side: OrderSide;
  type: OrderType;
  price: number;
  size: number;                  // 币数量
  value: number;                 // USDT 价值
  clientOrderId: string;
  strategy: 'dca' | 'grid' | 'manual' | 'emergency' | 'risk';
  metadata: Record<string, unknown>;
}

// =====================================================
// 订单生成器类
// =====================================================

export class OrderGenerator {
  private config: OrderGeneratorConfig;
  private productInfoCache: Map<string, any> = new Map();

  constructor(config: OrderGeneratorConfig) {
    this.config = config;
  }

  /**
   * 生成单个订单
   */
  async generateOrder(request: GenerateOrderRequest): Promise<GeneratedOrder> {
    // 获取产品信息
    const productInfo = await this.getProductInfo(request.coin);

    // 计算订单参数
    const price = request.price
      ? this.adjustPrice(request.price, productInfo, request.side)
      : await this.getMarketPrice(request.coin, request.side);

    const size = this.calculateOrderSize(request, price, productInfo);

    // 生成客户端订单 ID
    const clientOrderId = this.generateClientOrderId(request.strategy, request.coin);

    // 构建订单
    const order: GeneratedOrder = {
      symbol: `${request.coin}-USDT`,
      side: request.side,
      type: request.type,
      price,
      size,
      value: size * price,
      clientOrderId,
      strategy: request.strategy,
      metadata: {
        requestSize: request.size,
        originalPrice: request.price,
        generatedAt: Date.now()
      }
    };

    return order;
  }

  /**
   * 批量生成订单
   */
  async generateBatchOrders(request: GenerateBatchOrderRequest): Promise<GeneratedOrder[]> {
    const orders: GeneratedOrder[] = [];

    for (let i = 0; i < request.orders.length; i++) {
      const orderRequest = request.orders[i];
      if (!orderRequest) {
        continue;
      }

      try {
        const order = await this.generateOrder(orderRequest);
        orders.push(order);
      } catch (error) {
        console.error(`[OrderGenerator] 生成订单失败 (${i + 1}/${request.orders.length}):`, error);
        // 继续处理其他订单
      }
    }

    return orders;
  }

  /**
   * 从决策生成订单
   */
  async generateFromDecision(decision: Decision): Promise<GeneratedOrder> {
    const request: GenerateOrderRequest = {
      coin: decision.coin,
      side: decision.action as 'buy' | 'sell',
      type: 'limit',
      size: decision.size,
      price: decision.price,
      strategy: decision.type
    };

    return await this.generateOrder(request);
  }

  /**
   * 计算订单大小
   */
  private calculateOrderSize(
    request: GenerateOrderRequest,
    price: number,
    productInfo: any
  ): number {
    let sizeInUsdt = request.size || 0;

    // 如果没有指定大小，使用默认值
    if (!sizeInUsdt || sizeInUsdt <= 0) {
      sizeInUsdt = this.config.minOrderSize * 2; // 默认最小订单的2倍
    }

    // 计算币数量
    let size = sizeInUsdt / price;

    // 应用精度
    const lotSz = parseFloat(productInfo.lotSz);
    size = this.floorToPrecision(size, lotSz);

    // 检查最小订单大小
    const minSz = parseFloat(productInfo.minSz);
    if (size < minSz) {
      throw new Error(`订单大小 ${size} 小于最小值 ${minSz}`);
    }

    return size;
  }

  /**
   * 调整价格
   */
  private adjustPrice(
    price: number,
    productInfo: any,
    side: OrderSide
  ): number {
    const tickSz = parseFloat(productInfo.tickSz);

    // 应用价格精度
    let adjustedPrice = this.floorToPrecision(price, tickSz);

    // 根据订单方向调整价格（确保成交）
    if (side === 'buy') {
      // 买单稍微提高价格
      adjustedPrice += tickSz;
    } else {
      // 卖单稍微降低价格
      adjustedPrice -= tickSz;
    }

    return adjustedPrice;
  }

  /**
   * 获取市场价格
   */
  private async getMarketPrice(coin: AllowedCoin, side: OrderSide): Promise<number> {
    try {
      const symbol = `${coin}-USDT`;
      const ticker = await this.config.okxApi.getTicker(symbol);

      if (side === 'buy') {
        return parseFloat(ticker.askPx); // 买一价
      } else {
        return parseFloat(ticker.bidPx); // 卖一价
      }
    } catch (error) {
      throw new Error(`获取 ${coin} 市场价格失败: ${error}`);
    }
  }

  /**
   * 获取产品信息
   */
  private async getProductInfo(coin: AllowedCoin): Promise<any> {
    const symbol = `${coin}-USDT`;

    // 检查缓存
    if (this.productInfoCache.has(symbol)) {
      return this.productInfoCache.get(symbol);
    }

    try {
      // 从 OKX API 获取产品信息
      const instruments = await this.config.okxApi.getInstruments({
        instType: 'SPOT',
        instId: symbol
      });

      if (!instruments || instruments.length === 0) {
        throw new Error(`未找到产品信息: ${symbol}`);
      }

      const productInfo = instruments[0];
      this.productInfoCache.set(symbol, productInfo);

      return productInfo;
    } catch (error) {
      throw new Error(`获取 ${coin} 产品信息失败: ${error}`);
    }
  }

  /**
   * 生成客户端订单 ID
   */
  private generateClientOrderId(strategy: string, coin: AllowedCoin): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${strategy}_${coin}_${timestamp}_${random}`;
  }

  /**
   * 向下取整到指定精度
   */
  private floorToPrecision(value: number, precision: number): number {
    const multiplier = 1 / precision;
    return Math.floor(value * multiplier) / multiplier;
  }

  /**
   * 验证订单参数
   */
  validateOrder(order: GeneratedOrder): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // 检查价格
    if (order.price <= 0) {
      errors.push('价格必须大于 0');
    }

    // 检查数量
    if (order.size <= 0) {
      errors.push('数量必须大于 0');
    }

    // 检查价值
    if (order.value <= 0) {
      errors.push('订单价值必须大于 0');
    }

    // 检查最小订单价值
    if (order.value < this.config.minOrderSize) {
      errors.push(`订单价值 ${order.value.toFixed(2)} USDT 小于最小值 ${this.config.minOrderSize} USDT`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * 格式化订单为 OKX API 格式
   */
  formatForOkxApi(order: GeneratedOrder): any {
    return {
      instId: order.symbol,
      tdMode: 'cash',
      side: order.side,
      ordType: order.type,
      sz: order.size.toFixed(8),
      px: order.price.toFixed(this.config.pricePrecision),
      clOrdId: order.clientOrderId
    };
  }

  /**
   * 清除产品信息缓存
   */
  clearProductInfoCache(): void {
    this.productInfoCache.clear();
  }

  /**
   * 更新配置
   */
  updateConfig(config: Partial<OrderGeneratorConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * 获取配置
   */
  getConfig(): OrderGeneratorConfig {
    return { ...this.config };
  }
}
