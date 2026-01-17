/**
 * OKX WebSocket 类型定义
 *
 * 功能：
 * - WebSocket 消息类型定义
 * - 频道订阅参数类型
 * - 事件回调类型
 */

import type { InstType } from '../core/constants;

// =====================================================
// WebSocket 操作类型
// =====================================================

/**
 * WebSocket 操作类型
 */
export type WsOperation =
  | 'login'          // 登录认证
  | 'subscribe'      // 订阅频道
  | 'unsubscribe'    // 取消订阅
  | 'ping';          // 心跳

// =====================================================
// 通用消息类型
// =====================================================

/**
 * WebSocket 请求消息
 */
export interface WsRequest {
  op: WsOperation;
  args?: WsRequestArgs[];
}

/**
 * WebSocket 请求参数
 */
export type WsRequestArgs =
  | WsLoginArgs
  | WsChannelArgs;

/**
 * 登录参数
 */
export interface WsLoginArgs {
  apiKey: string;
  passphrase: string;
  timestamp: string;
  sign: string;
}

/**
 * 频道订阅参数
 */
export interface WsChannelArgs {
  channel: string;
  instType?: InstType;
  instId?: string;
  ccy?: string;
  instFamily?: string;
  bar?: string;  // K线周期
}

/**
 * WebSocket 响应消息
 */
export interface WsResponse {
  event?: string;           // 事件类型：login, subscribe, unsubscribe, error
  code?: string;            // 错误码
  msg?: string;             // 消息
  connId?: string;          // 连接ID
  data?: unknown[];         // 响应数据
  arg?: WsChannelArgs;      // 订阅参数（用于数据推送）
}

/**
 * WebSocket 数据推送消息
 */
export interface WsDataMessage<T = unknown> {
  arg: WsChannelArgs;       // 订阅参数
  data: T[];                // 数据
}

// =====================================================
// 频道数据类型
// =====================================================

/**
 * 账户频道数据
 */
export interface AccountChannelData {
  bal: string;              // 余额
  frozenBal: string;        // 冻结余额
  availBal: string;         // 可用余额
  ccy: string;              // 币种
  eq: string;               // 美金权益
  liab: string;             // 债务额
  upl: string;              // 未实现盈亏
  uplLiab: string;          // 未实现亏损
  crossLiab: string;        // 全仓欠款
  isoLiab: string;          // 逐仓欠款
  marginRatio: string;      // 保证金率
  interest: string;         // 计息
  stpBal: string;           // 止盈止损余额
  cashBal: string;          // 资金账户余额
  uTime: string;            // 更新时间
}

/**
 * 持仓频道数据（仅合约）
 */
export interface PositionChannelData {
  instType: InstType;       // 产品类型
  instId: string;           // 产品ID
  pos: string;              // 持仓数量
  posCcy: string;           // 持仓币种
  avgPx: string;            // 开仓平均价
  upl: string;              // 未实现盈亏
  uplRatio: string;         // 未实现盈亏率
  lever: string;            // 杠杆倍数
  liqPx: string;            // 强平价格
  markPx: string;           // 标记价格
  markValue: string;        // 标记价值
  imr: string;              // 初始保证金
  margin: string;           // 保证金余额
  mgnRatio: string;         // 保证金率
  ccy: string;              // 保证金币种
  posId: string;            // 持仓ID
  notionalUsd: string;      // 美金价值
  adl: string;              // ADL排名
  deltaBS: string;          // 希腊值
  gammaBS: string;          // 希腊值
  thetaBS: string;          // 希腊值
  vegaBS: string;           // 希腊值
  uTime: string;            // 更新时间
}

/**
 * 订单频道数据
 */
export interface OrderChannelData {
  instType: InstType;       // 产品类型
  instId: string;           // 产品ID
  ordId: string;            // 订单ID
  clOrdId: string;          // 客户自定义订单ID
  tag: string;              // 订单标签
  px: string;               // 委托价格
  sz: string;               // 委托数量
  pnl: string;              // 收益（仅止损止盈返回）
  ordType: string;          // 订单类型
  side: string;             // 订单方向
  posSide: string;          // 持仓方向（仅合约）
  tdMode: string;           // 交易模式
  accFillSz: string;        // 累计成交数量
  fillPx: string;           // 最新成交价格（仅部分成交或完全成交时返回）
  tradeId: string;          // 最新成交ID（仅部分成交或完全成交时返回）
  fillSz: string;           // 最新成交数量（仅部分成交或完全成交时返回）
  fillTime: string;         // 最新成交时间（仅部分成交或完全成交时返回）
  state: string;            // 订单状态
  avgPx: string;            // 成交平均价（仅完全成交时返回）
  lever: string;            // 杠杆倍数（仅合约）
  tpTriggerPx: string;      // 止盈触发价
  tpTriggerPxType: string;  // 止盈触发价类型
  tpOrdPx: string;          // 止盈委托价
  slTriggerPx: string;      // 止损触发价
  slTriggerPxType: string;  // 止损触发价类型
  slOrdPx: string;          // 止损委托价
  feeCcy: string;           // 手续费币种
  fee: string;              // 手续费
  source: string;           // 订单来源
  category: string;         // 订单种类
  reduceOnly: string;       // 是否只减仓
  cancelSource: string;     // 撤单来源
  quickMgnType: string;     // 一键借币类型
  algoClOrdId: string;      // 客户自定义策略订单ID
  algoId: string;           // 策略订单ID
  uTime: string;            // 订单状态更新时间
  cTime: string;            // 订单创建时间
  reqId: string;            // 请求ID
  amendPxOnTriggerType: string;  // 止盈止损触发类型
}

/**
 * 策略订单频道数据
 */
export interface AlgoOrderChannelData {
  instType: InstType;       // 产品类型
  instId: string;           // 产品ID
  algoId: string;           // 策略订单ID
  clOrdId: string;          // 客户自定义订单ID
  tag: string;              // 订单标签
  sTriggerPx: string;       // 止盈触发价
  tpTriggerPx: string;      // 止盈触发价
  slTriggerPx: string;      // 止损触发价
  triggerPx: string;        // 触发价格
  orderPx: string;          // 委托价格
  sz: string;               // 委托数量
  reduceOnly: string;       // 是否只减仓
  pxVar: string;            // 价格偏移
  pxSpd: string;            // 价格间距
  pxLim: string;            // 价格限制
  szLimit: string;          // 数量限制
  tpTriggerPxType: string;  // 止盈触发价类型
  slTriggerPxType: string;  // 止损触发价类型
  triggerPxType: string;    // 止盈止损触发类型
  amendPxOnTriggerType: string;  // 止盈止损触发类型
  algoClOrdId: string;      // 客户自定义策略订单ID
  tpOrdPx: string;          // 止盈委托价
  slOrdPx: string;          // 止损委托价
  side: string;             // 订单方向
  posSide: string;          // 持仓方向（仅合约）
  tdMode: string;           // 交易模式
  ordType: string;          // 订单类型
  state: string;            // 策略订单状态
  lever: string;            // 杠杆倍数（仅合约）
  ccy: string;              // 币种
  fillSz: string;           // 最新成交数量
  fillPx: string;           // 最新成交价格
  tradeId: string;          // 最新成交ID
  avgPx: string;            // 成交平均价
  actualSz: string;         // 实际触发数量
  actualPx: string;         // 实际触发价格
  actualTriggerPx: string;  // 实际触发价格
  callbackRatio: string;    // 回调比例
  callbackSpread: string;   // 回调价差
  moveTriggerPx: string;    // 移动止损触发价
  activePx: string;         // 止盈止损激活价格
  uTime: string;            // 策略订单状态更新时间
  cTime: string;            // 策略订单创建时间
  category: string;         // 订单种类
  quickMgnType: string;     // 一键借币类型
  triggerTime: string;      // 触发时间
}

/**
 * 行情频道数据
 */
export interface TickerChannelData {
  instType: string;         // 产品类型
  instId: string;           // 产品ID
  last: string;             // 最新成交价
  lastSz: string;           // 最新成交的数量
  askPx: string;            // 最新买一价
  bidPx: string;            // 最新卖一价
  open24h: string;          // 24小时开盘价
  high24h: string;          // 24小时最高价
  low24h: string;           // 24小时最低价
  volCcy24h: string;        // 24小时成交量，以成交货币计算
  vol24h: string;           // 24小时成交量，以张计算
  sodUtc0: string;          // 0点时的价格
  sodUtc8: string;          // UTC+8 时区0点时的价格
  ts: string;               // 数据产生时间
}

/**
 * K线频道数据
 */
export interface CandleChannelData {
  instType: string;         // 产品类型
  instId: string;           // 产品ID
  candle: string[];         // K线数据：[时间戳, 开盘价, 最高价, 最低价, 收盘价, 成交量(张), 成交额(币), 成交额(USDT), 确认状态]
}

/**
 * 深度频道数据
 */
export interface OrderBookChannelData {
  instId: string;           // 产品ID
  asks: OrderBookLevel[];   // 卖方深度
  bids: OrderBookLevel[];   // 买方深度
  ts: string;               // 数据产生时间
}

/**
 * 订单簿深度
 */
export interface OrderBookLevel {
  [key: string]: string | number;  // [价格, 数量, 订单数] 或 [价格, 数量]
}

/**
 * 交易频道数据
 */
export interface TradeChannelData {
  instId: string;           // 产品ID
  tradeId: string;          // 交易ID
  px: string;               // 成交价格
  sz: string;               // 成交数量
  side: string;             // 成交方向
  ts: string;               // 数据产生时间
}

/**
 * 状态频道数据
 */
export interface StatusChannelData {
  title: string;            // 标题
  state: string;            // 状态
  currency: string;         // 币种
  begin: string;            // 开始时间
  end: string;              // 结束时间
  system: string;           // 系统
  type: string;             // 类型
}

// =====================================================
// 事件回调类型
// =====================================================

/**
 * 频道数据回调
 * 注意：回调函数接收的是数组类型
 */
export type ChannelCallback<T = unknown> = (data: T[]) => void;

/**
 * 事件回调
 */
export type EventCallback = (event: WsResponse) => void;

/**
 * 错误回调
 */
export type ErrorCallback = (error: Error) => void;

/**
 * 连接状态
 */
export type ConnectionState =
  | 'disconnected'   // 未连接
  | 'connecting'     // 连接中
  | 'connected'      // 已连接
  | 'authenticating' // 认证中
  | 'authenticated'; // 已认证

/**
 * WebSocket 配置
 */
export interface WsClientConfig {
  apiKey: string;
  secretKey: string;
  passphrase: string;
  isDemo?: boolean;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  maxReconnectAttempts?: number;
  pingInterval?: number;
  proxy?: string;

  // 代理控制
  /** 是否启用代理 (默认: 根据环境变量自动检测) */
  enableProxy?: boolean;
  /** 代理URL (优先级高于环境变量) */
  proxyUrl?: string;

  // 指数退避配置
  useExponentialBackoff?: boolean;     // 是否使用指数退避（默认 true）
  maxReconnectInterval?: number;       // 最大重连间隔（默认 60000ms = 60秒）
  backoffMultiplier?: number;          // 退避倍数（默认 1.5）
}

/**
 * 订阅配置
 */
export interface SubscribeConfig {
  channel: string;
  instType?: InstType;
  instId?: string;
  ccy?: string;
  instFamily?: string;
  bar?: string;
}

/**
 * 订阅信息
 */
export interface Subscription {
  config: SubscribeConfig;
  callback: ChannelCallback;
}
