/**
 * OKX WebSocket 模块
 *
 * 功能：
 * - 公共频道订阅（行情、K线、深度、交易）
 * - 私有频道订阅（账户、持仓、订单）
 * - 自动重连机制
 * - 心跳保活
 */

export {
  WsClient,
  createWsClient,
  createWsClientFromEnv,
} from './client;

export type {
  // 通用类型
  WsClientConfig,
  ConnectionState,
  SubscribeConfig,
  Subscription,
  ChannelCallback,
  EventCallback,
  ErrorCallback,

  // 消息类型
  WsRequest,
  WsResponse,
  WsDataMessage,
  WsRequestArgs,
  WsLoginArgs,
  WsChannelArgs,

  // 频道数据类型
  AccountChannelData,
  PositionChannelData,
  OrderChannelData,
  AlgoOrderChannelData,
  TickerChannelData,
  CandleChannelData,
  OrderBookChannelData,
  OrderBookLevel,
  TradeChannelData,
  StatusChannelData,
} from './types;
