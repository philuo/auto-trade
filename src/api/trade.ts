/**
 * OKX Trade API 接口
 *
 * 功能：
 * - 下单（市价单、限价单、只挂单等）
 * - 撤单（单个、批量）
 * - 改单（修改订单价格或数量）
 * - 获取订单信息
 * - 获取订单列表
 * - 获取成交明细
 * - 策略订单（止盈止损、条件单）
 */

import { RestClient } from './rest.js';
import { type OkxAuth } from '../core/auth.js';
import type { TdMode, InstType, OrderType as CoreOrderType } from '../core/constants.js';

// =====================================================
// 订单类型
// =====================================================

/**
 * 订单类型
 */
export type OrderType =
  | 'market'      // 市价单
  | 'limit'       // 限价单
  | 'post_only'   // 只挂单
  | 'fok'         // 全部成交或立即取消
  | 'ioc';        // 立即成交并取消剩余

/**
 * 订单方向
 */
export type OrderSide = 'buy' | 'sell';

/**
 * 订单状态
 */
export type OrderState =
  | 'live'                // 等待成交
  | 'partially_filled'    // 部分成交
  | 'filled'              // 完全成交
  | 'canceled';           // 已撤销

// =====================================================
// 下单参数
// =====================================================

/**
 * 下单参数
 */
export interface PlaceOrderParams {
  instId: string;               // 产品ID
  tdMode: TdMode;               // 交易模式
  side: OrderSide;              // 订单方向
  ordType: OrderType;           // 订单类型
  sz: string;                   // 委托数量
  ccy?: string;                 // 币种（仅单币种保证金模式全仓杠杆、单向持仓模式下的永续合约需要）
  clOrdId?: string;             // 客户自定义订单ID
  tag?: string;                 // 订单标签
  posSide?: string;             // 持仓方向
  px?: string;                  // 委托价格（limit、post_only、fok、ioc 订单必填）
  reduceOnly?: boolean;         // 是否只减仓
  tpTriggerPx?: string;         // 止盈触发价
  tpOrdPx?: string;             // 止盈委托价
  slTriggerPx?: string;         // 止损触发价
  slOrdPx?: string;             // 止损委托价
  attachAlgoOrds?: AttachAlgoOrd[]; // 附加策略订单
  [key: string]: unknown;        // 索引签名，允许其他字段
}

/**
 * 附加策略订单
 */
export interface AttachAlgoOrd {
  attachAlgoClOrdId?: string;   // 策略订单自定义ID
  tpTriggerPx?: string;         // 止盈触发价
  tpOrdPx?: string;             // 止盈委托价
  slTriggerPx?: string;         // 止损触发价
  slOrdPx?: string;             // 止损委托价
  sz?: string;                  // 策略数量
  tpTriggerPxType?: string;     // 止盈触发价类型
  slTriggerPxType?: string;     // 止损触发价类型
  ammPx?: string;               // 期权希腊值保险计算
  tpExecMode?: string;          // 止盈执行模式
  slExecMode?: string;          // 止损执行模式
  [key: string]: unknown;        // 索引签名，允许其他字段
}

/**
 * 批量下单参数
 */
export interface PlaceBatchOrderParams {
  orders: PlaceOrderParams[];
  [key: string]: unknown;
}

// =====================================================
// 订单信息
// =====================================================

/**
 * 订单信息
 */
export interface OrderInfo {
  accFillSz: string;            // 累计成交数量
  avgPx: string;                // 成交均价
  cTime: string;                // 订单创建时间
  category: string;             // 类别
  ccy: string;                  // 币种
  clOrdId: string;              // 客户自定义订单ID
  fee: string;                  // 手续费
  feeCcy: string;               // 手续费币种
  fillPx: string;               // 最新成交价格
  fillSz: string;               // 最新成交数量
  fillTime: string;             // 最新成交时间
  instId: string;               // 产品ID
  lever: string;                // 杠杆倍数
  notifyType: string;           // 条件单触发类型
  ordId: string;                // 订单ID
  ordType: string;              // 订单类型
  pnl: string;                  // 收益
  posSide: string;              // 持仓方向
  px: string;                   // 委托价格
  rebatesCcy: string;           // 返佣币种
  rebatesInfo: string;          // 返佣信息
  slOrdPx: string;              // 止损委托价
  state: OrderState;            // 订单状态
  side: OrderSide;              // 订单方向
  source: string;               // 订单来源
  sz: string;                   // 委托数量
  tag: string;                  // 订单标签
  tdMode: string;               // 交易模式
  tpOrdPx: string;              // 止盈委托价
  tradeId: string;              // 最新成交ID
  uTime: string;                // 订单更新时间
  usdPx: string;                // 美金价格
  algoClOrdId: string;          // 策略订单自定义ID
  algoId: string;               // 策略订单ID
  attachAlgoClOrdId: string;    // 附加策略订单自定义ID
  attachAlgoId: string;         // 附加策略订单ID
  tgtCcy: string;               // 目标币种
  cancelSource: string;         // 撤单来源
  cancelSourceReason: string;   // 撤单原因
  quickMgnType: string;         // 快速借贷类型
  optLegs: OptLeg[];            // 组合订单腿
  attachAlgoOrds: AttachAlgoOrd[]; // 附加策略订单
  reqNum: string;               // 请求编号
  attachAlgoOrdsResp: AttachAlgoOrd[]; // 附加策略订单响应
}

/**
 * 组合订单腿
 */
export interface OptLeg {
  instId: string;               // 产品ID
  ratio: string;                // 比例
  side: string;                 // 订单方向
  posSide: string;              // 持仓方向
}

/**
 * 下单结果
 */
export interface PlaceOrderResult {
  ordId: string;                // 订单ID
  clOrdId: string;              // 客户自定义订单ID
  tag: string;                  // 订单标签
  sCode: string;                // 事件执行结果的code
  sMsg: string;                 // 事件执行结果的msg
}

// =====================================================
// 撤单参数
// =====================================================

/**
 * 撤单参数
 */
export interface CancelOrderParams {
  instId: string;               // 产品ID
  ordId?: string;               // 订单ID
  clOrdId?: string;             // 客户自定义订单ID
  [key: string]: unknown;
}

/**
 * 批量撤单参数
 */
export interface CancelBatchOrderParams {
  orders: CancelOrderParams[];
  [key: string]: unknown;
}

/**
 * 撤单结果
 */
export interface CancelOrderResult {
  ordId: string;                // 订单ID
  clOrdId: string;              // 客户自定义订单ID
  sCode: string;                // 事件执行结果的code
  sMsg: string;                 // 事件执行结果的msg
}

// =====================================================
// 改单参数
// =====================================================

/**
 * 改单参数
 */
export interface AmendOrderParams {
  instId: string;               // 产品ID
  ordId?: string;               // 订单ID
  clOrdId?: string;             // 客户自定义订单ID
  reqId?: string;               // 客户自定义请求ID
  newSz?: string;               // 新的数量
  newPx?: string;               // 新的价格
  tpTriggerPx?: string;         // 新的止盈触发价
  tpOrdPx?: string;             // 新的止盈委托价
  slTriggerPx?: string;         // 新的止损触发价
  slOrdPx?: string;             // 新的止损委托价
  newTpTriggerPx?: string;      // 新的止盈触发价
  newTpOrdPx?: string;          // 新的止盈委托价
  newSlTriggerPx?: string;      // 新的止损触发价
  newSlOrdPx?: string;          // 新的止损委托价
  attachAlgoOrds?: AttachAlgoOrd[]; // 附加策略订单
  [key: string]: unknown;
}

/**
 * 批量改单参数
 */
export interface AmendBatchOrderParams {
  orders: AmendOrderParams[];
  [key: string]: unknown;
}

/**
 * 改单结果
 */
export interface AmendOrderResult {
  ordId: string;                // 订单ID
  clOrdId: string;              // 客户自定义订单ID
  reqId: string;                // 客户自定义请求ID
  sCode: string;                // 事件执行结果的code
  sMsg: string;                 // 事件执行结果的msg
}

// =====================================================
// 订单列表参数
// =====================================================

/**
 * 订单列表请求参数
 */
export interface OrdersListParams {
  instType?: InstType;          // 产品类型
  instId?: string;              // 产品ID
  ordType?: string;             // 订单类型
  state?: OrderState;           // 订单状态
  after?: string;               // 请求此时间戳之前的内容
  before?: string;              // 请求此时间戳之后的内容
  limit?: string;               // 返回结果的数量
  ordId?: string;               // 订单ID
  [key: string]: string | number | boolean | undefined;
}

// =====================================================
// 成交明细
// =====================================================

/**
 * 成交明细
 */
export interface TradeHistory {
  instId: string;               // 产品ID
  tradeId: string;              // 成交ID
  ordId: string;                // 订单ID
  clOrdId: string;              // 客户自定义订单ID
  billId: string;               // 账单ID
  tag: string;                  // 订单标签
  fillPx: string;               // 成交价格
  fillSz: string;               // 成交数量
  side: OrderSide;              // 订单方向
  posSide: string;              // 持仓方向
  execType: string;             // 流动性方向 T or M
  feeCcy: string;               // 手续费币种
  fee: string;                  // 手续费
  ts: string;                   // 成交时间
  pnl: string;                  // 收益
  source: string;               // 订单来源
  ccy: string;                  // 币种
  category: string;             // 类别
  quickMgnType: string;         // 快速借贷类型
}

/**
 * 成交明细请求参数
 */
export interface TradeHistoryParams {
  instType?: InstType;          // 产品类型
  instId?: string;              // 产品ID
  ordId?: string;               // 订单ID
  after?: string;               // 请求此时间戳之前的内容
  before?: string;              // 请求此时间戳之后的内容
  limit?: string;               // 返回结果的数量
  [key: string]: string | number | boolean | undefined;
}

// =====================================================
// 止盈止损
// =====================================================

/**
 * 策略订单类型
 */
export type AlgoOrdType =
  | 'conditional'               // 条件单
  | 'oco'                       // 止盈止损
  | 'trigger'                   // 条件委托
  | 'move_order_stop'           // 移动止盈止损
  | 'take_profit'               // 止盈委托
  | 'stop_loss'                 // 止损委托
  | 'position_side'             // 双向持仓模式
  | 'trailing_stop';            // 跟踪止盈止损

/**
 * 策略订单状态
 */
export type AlgoOrdState =
  | 'live'                      // 等待触发
  | 'partially_triggered'       // 部分触发
  | 'triggered'                 // 已触发
  | 'canceled';                 // 已撤销

/**
 * 策略订单参数
 */
export interface PlaceAlgoOrderParams {
  instId: string;               // 产品ID
  tdMode: TdMode;               // 交易模式
  side: OrderSide;              // 订单方向
  ordType: AlgoOrdType;         // 策略订单类型
  sz: string;                   // 委托数量
  ccy?: string;                 // 币种
  posSide?: string;             // 持仓方向
  reduceOnly?: boolean;         // 是否只减仓
  tpTriggerPx?: string;         // 止盈触发价
  tpOrdPx?: string;             // 止盈委托价
  slTriggerPx?: string;         // 止损触发价
  slOrdPx?: string;             // 止损委托价
  tpTriggerPxType?: string;     // 止盈触发价类型
  slTriggerPxType?: string;     // 止损触发价类型
  tpExecMode?: string;          // 止盈执行模式
  slExecMode?: string;          // 止损执行模式
  triggerPx?: string;           // 触发价格
  triggerPxType?: string;       // 触发价格类型
  orderPx?: string;             // 委托价格
  attachAlgoOrds?: AttachAlgoOrd[]; // 附加策略订单
  callbackCt?: string;          // 回调扩展类型
  callbackUrl?: string;         // 回调地址
  szOnTriggerBand?: string;     // 触发时的数量
  tpTriggerPxBand?: string;     // 止盈触发价格带
  slTriggerPxBand?: string;     // 止损触发价格带
  quickMgnType?: string;        // 快速借贷类型
  callbackRatio?: string;       // 回调比率
  moveTriggerPx?: string;       // 移动止盈止损触发价
  callbackSpread?: string;      // 回调扩展率
  triggerPxBand?: string;       // 触发价格带
  szOnTriggerType?: string;     // 触发时的数量类型
  ammPx?: string;               // 期权希腊值保险计算
  tpTriggerPxBandRatio?: string; // 止盈触发价格带比率
  slTriggerPxBandRatio?: string; // 止损触发价格带比率
  tpPxUsd?: string;             // 止盈美金价格
  slPxUsd?: string;             // 止损美金价格
  triggerPxUsd?: string;        // 触发美金价格
  orderPxUsd?: string;          // 委托美金价格
  algoClOrdId?: string;         // 策略订单自定义ID
  attachAlgoClOrdId?: string;   // 附加策略订单自定义ID
  tpTriggerTime?: string;       // 止盈触发时间
  slTriggerTime?: string;       // 止损触发时间
  tpTriggerPxBandDirection?: string; // 止盈触发价格带方向
  slTriggerPxBandDirection?: string; // 止损触发价格带方向
  [key: string]: unknown;
}

/**
 * 策略订单信息
 */
export interface AlgoOrderInfo {
  algoId: string;               // 策略订单ID
  instId: string;               // 产品ID
  ordType: AlgoOrdType;         // 策略订单类型
  cTime: string;                // 策略订单创建时间
  uTime: string;                // 策略订单更新时间
  state: AlgoOrdState;          // 策略订单状态
  side: OrderSide;              // 订单方向
  slTriggerPx: string;          // 止损触发价
  slOrdPx: string;              // 止损委托价
  sz: string;                   // 委托数量
  tpTriggerPx: string;          // 止盈触发价
  tpOrdPx: string;              // 止盈委托价
  triggerPx: string;            // 触发价格
  orderPx: string;              // 委托价格
  actualSz: string;             // 实际数量
  pxTriggered: string;          // 触发价格
  pxTriggeredAvgPx: string;     // 触发成交均价
  actualSide: string;           // 实际订单方向
  ccy: string;                  // 币种
  leverage: string;             // 杠杆倍数
  tpTriggerPxType: string;      // 止盈触发价类型
  slTriggerPxType: string;      // 止损触发价类型
  attachAlgoOrds: AttachAlgoOrd[]; // 附加策略订单
  algoClOrdId: string;          // 策略订单自定义ID
  callbackCt: string;           // 回调扩展类型
  callbackUrl: string;          // 回调地址
  triggerTime: string;          // 触发时间
  ordId: string;                // 订单ID
  tpExecMode: string;           // 止盈执行模式
  slExecMode: string;           // 止损执行模式
  moveTriggerPx: string;        // 移动止盈止损触发价
  tpTriggerTime: string;        // 止盈触发时间
  slTriggerTime: string;        // 止损触发时间
  tpTriggerPxBand: string;      // 止盈触发价格带
  slTriggerPxBand: string;      // 止损触发价格带
  szOnTriggerBand: string;      // 触发时的数量
  tpTriggerPxBandDirection: string; // 止盈触发价格带方向
  slTriggerPxBandDirection: string; // 止损触发价格带方向
  tpTriggerPxBandRatio: string; // 止盈触发价格带比率
  slTriggerPxBandRatio: string; // 止损触发价格带比率
  tpPxUsd: string;              // 止盈美金价格
  slPxUsd: string;              // 止损美金价格
  triggerPxUsd: string;         // 触发美金价格
  orderPxUsd: string;           // 委托美金价格
  fillSz: string;               // 成交数量
  fillPx: string;               // 成交价格
  avgPx: string;                // 成交均价
  posSide: string;              // 持仓方向
  tag: string;                  // 订单标签
  quickMgnType: string;         // 快速借贷类型
}

/**
 * 策略订单列表请求参数
 */
export interface AlgoOrdersListParams {
  instType?: InstType;          // 产品类型
  instId?: string;              // 产品ID
  algoId?: string;              // 策略订单ID
  ordType?: string;             // 订单类型
  state?: AlgoOrdState;         // 订单状态
  after?: string;               // 请求此时间戳之前的内容
  before?: string;              // 请求此时间戳之后的内容
  limit?: string;               // 返回结果的数量
  [key: string]: string | number | boolean | undefined;
}

// =====================================================
// 交易 API 客户端
// =====================================================

export class TradeApi {
  private client: RestClient;
  private auth: OkxAuth;

  constructor(auth: OkxAuth, isDemo = true, proxy?: string) {
    this.auth = auth;
    this.client = new RestClient(auth, isDemo, proxy);
  }

  /**
   * 下单
   * @param params 下单参数
   */
  async placeOrder(params: PlaceOrderParams): Promise<PlaceOrderResult> {
    const results = await this.client.post<PlaceOrderResult[]>('/trade/order', params);
    return results[0];
  }

  /**
   * 批量下单
   * @param params 批量下单参数
   */
  async placeBatchOrder(params: PlaceBatchOrderParams): Promise<PlaceOrderResult[]> {
    return this.client.post<PlaceOrderResult[]>('/trade/batch-orders', params);
  }

  /**
   * 撤单
   * @param params 撤单参数
   */
  async cancelOrder(params: CancelOrderParams): Promise<CancelOrderResult> {
    const results = await this.client.post<CancelOrderResult[]>('/trade/cancel-order', params);
    return results[0];
  }

  /**
   * 批量撤单
   * @param params 批量撤单参数
   */
  async cancelBatchOrder(params: CancelBatchOrderParams): Promise<CancelOrderResult[]> {
    return this.client.post<CancelOrderResult[]>('/trade/cancel-batch-orders', params);
  }

  /**
   * 修改订单
   * @param params 改单参数
   */
  async amendOrder(params: AmendOrderParams): Promise<AmendOrderResult> {
    const results = await this.client.post<AmendOrderResult[]>('/trade/amend-order', params);
    return results[0];
  }

  /**
   * 批量修改订单
   * @param params 批量改单参数
   */
  async amendBatchOrder(params: AmendBatchOrderParams): Promise<AmendOrderResult[]> {
    return this.client.post<AmendOrderResult[]>('/trade/amend-batch-orders', params);
  }

  /**
   * 获取订单信息
   * @param instId 产品ID
   * @param ordId 订单ID
   * @param clOrdId 客户自定义订单ID
   */
  async getOrder(instId: string, ordId?: string, clOrdId?: string): Promise<OrderInfo[]> {
    const params: Record<string, string> = { instId };
    if (ordId) params.ordId = ordId;
    if (clOrdId) params.clOrdId = clOrdId;
    return this.client.get<OrderInfo[]>('/trade/order', params);
  }

  /**
   * 获取订单列表
   * @param params 订单列表请求参数
   */
  async getOrdersList(params?: OrdersListParams): Promise<OrderInfo[]> {
    return this.client.get<OrderInfo[]>('/trade/orders-pending', params);
  }

  /**
   * 获取历史订单记录（包括已撤销）
   * @param params 订单列表请求参数
   */
  async getOrdersHistory(params?: OrdersListParams): Promise<OrderInfo[]> {
    return this.client.get<OrderInfo[]>('/trade/orders-history', params);
  }

  /**
   * 获取成交明细
   * @param params 成交明细请求参数
   */
  async getTradeHistory(params?: TradeHistoryParams): Promise<TradeHistory[]> {
    return this.client.get<TradeHistory[]>('/trade/fills-history', params);
  }

  /**
   * 获取策略订单列表
   * @param params 策略订单列表请求参数
   */
  async getAlgoOrdersList(params?: AlgoOrdersListParams): Promise<AlgoOrderInfo[]> {
    return this.client.get<AlgoOrderInfo[]>('/trade/orders-algo-pending', params);
  }

  /**
   * 获取策略订单历史
   * @param params 策略订单列表请求参数
   */
  async getAlgoOrdersHistory(params?: AlgoOrdersListParams): Promise<AlgoOrderInfo[]> {
    return this.client.get<AlgoOrderInfo[]>('/trade/orders-algo-history', params);
  }

  /**
   * 下策略订单
   * @param params 策略订单参数
   */
  async placeAlgoOrder(params: PlaceAlgoOrderParams): Promise<{ algoId: string }> {
    const results = await this.client.post<{ algoId: string }[]>('/trade/order-algo', params);
    return results[0];
  }

  /**
   * 撤销策略订单
   * @param instId 产品ID
   * @param algoIds 策略订单ID列表
   */
  async cancelAlgoOrder(instId: string, algoIds: string[]): Promise<void> {
    await this.client.post('/trade/cancel-algos', {
      instId,
      algoIds
    });
  }

  /**
   * 修改策略订单
   * @param params 策略订单参数（包含 algoId）
   */
  async amendAlgoOrder(params: PlaceAlgoOrderParams & { algoId: string }): Promise<void> {
    await this.client.post('/trade/amend-algos', params);
  }

  /**
   * 市价买入
   * @param instId 产品ID
   * @param amount 买入数量
   * @param tdMode 交易模式
   */
  async marketBuy(instId: string, amount: string, tdMode: TdMode = 'cash'): Promise<PlaceOrderResult> {
    return this.placeOrder({
      instId,
      tdMode,
      side: 'buy',
      ordType: 'market',
      sz: amount
    });
  }

  /**
   * 市价卖出
   * @param instId 产品ID
   * @param amount 卖出数量
   * @param tdMode 交易模式
   */
  async marketSell(instId: string, amount: string, tdMode: TdMode = 'cash'): Promise<PlaceOrderResult> {
    return this.placeOrder({
      instId,
      tdMode,
      side: 'sell',
      ordType: 'market',
      sz: amount
    });
  }

  /**
   * 限价买入
   * @param instId 产品ID
   * @param price 委托价格
   * @param amount 买入数量
   * @param tdMode 交易模式
   */
  async limitBuy(instId: string, price: string, amount: string, tdMode: TdMode = 'cash'): Promise<PlaceOrderResult> {
    return this.placeOrder({
      instId,
      tdMode,
      side: 'buy',
      ordType: 'limit',
      px: price,
      sz: amount
    });
  }

  /**
   * 限价卖出
   * @param instId 产品ID
   * @param price 委托价格
   * @param amount 卖出数量
   * @param tdMode 交易模式
   */
  async limitSell(instId: string, price: string, amount: string, tdMode: TdMode = 'cash'): Promise<PlaceOrderResult> {
    return this.placeOrder({
      instId,
      tdMode,
      side: 'sell',
      ordType: 'limit',
      px: price,
      sz: amount
    });
  }

  /**
   * 只挂单（挂在高买/低卖位置，确保不会立即成交）
   * @param instId 产品ID
   * @param price 委托价格
   * @param side 订单方向
   * @param amount 委托数量
   * @param tdMode 交易模式
   */
  async postOnly(instId: string, price: string, side: OrderSide, amount: string, tdMode: TdMode = 'cash'): Promise<PlaceOrderResult> {
    return this.placeOrder({
      instId,
      tdMode,
      side,
      ordType: 'post_only',
      px: price,
      sz: amount
    });
  }
}

// =====================================================
// 工具函数
// =====================================================

/**
 * 创建交易 API 客户端实例
 */
export function createTradeApi(auth: OkxAuth, isDemo = true, proxy?: string): TradeApi {
  return new TradeApi(auth, isDemo, proxy);
}

/**
 * 格式化订单信息
 */
export function formatOrder(order: OrderInfo): {
  ordId: string;
  instId: string;
  side: OrderSide;
  type: string;
  price: number;
  size: number;
  filledSize: number;
  avgPrice: number;
  state: OrderState;
  fee: number;
  createdTime: number;
  updatedTime: number;
} {
  return {
    ordId: order.ordId,
    instId: order.instId,
    side: order.side,
    type: order.ordType,
    price: parseFloat(order.px || '0'),
    size: parseFloat(order.sz),
    filledSize: parseFloat(order.accFillSz),
    avgPrice: parseFloat(order.avgPx || '0'),
    state: order.state,
    fee: parseFloat(order.fee || '0'),
    createdTime: parseInt(order.cTime),
    updatedTime: parseInt(order.uTime)
  };
}

/**
 * 格式化成交明细
 */
export function formatTrade(trade: TradeHistory): {
  tradeId: string;
  ordId: string;
  instId: string;
  side: OrderSide;
  price: number;
  size: number;
  fee: number;
  feeCcy: string;
  timestamp: number;
} {
  return {
    tradeId: trade.tradeId,
    ordId: trade.ordId,
    instId: trade.instId,
    side: trade.side,
    price: parseFloat(trade.fillPx),
    size: parseFloat(trade.fillSz),
    fee: parseFloat(trade.fee || '0'),
    feeCcy: trade.feeCcy,
    timestamp: parseInt(trade.ts)
  };
}

/**
 * 检查订单是否完成
 */
export function isOrderFilled(order: OrderInfo): boolean {
  return order.state === 'filled';
}

/**
 * 检查订单是否部分完成
 */
export function isOrderPartiallyFilled(order: OrderInfo): boolean {
  return order.state === 'partially_filled';
}

/**
 * 检查订单是否有效（未撤销）
 */
export function isOrderLive(order: OrderInfo): boolean {
  return order.state === 'live' || order.state === 'partially_filled';
}

/**
 * 计算成交进度
 */
export function fillProgress(order: OrderInfo): number {
  const size = parseFloat(order.sz);
  const filled = parseFloat(order.accFillSz);
  if (size === 0) return 0;
  return (filled / size) * 100;
}
