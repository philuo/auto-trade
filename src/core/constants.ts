/**
 * OKX API 常量定义
 *
 * 更新时间: 2025-01-18
 * 参考: https://www.npmjs.com/package/okx-api
 */

// =====================================================
// API 端点
// =====================================================

export const API_ENDPOINTS = {
  // REST API - 所有环境使用相同端点
  // 区分方式: 使用对应环境创建的 API Key
  DEMO_REST: 'https://www.okx.com',
  DEMO_REST_API: 'https://www.okx.com/api/v5',

  LIVE_REST: 'https://www.okx.com',
  LIVE_REST_API: 'https://www.okx.com/api/v5',

  // WebSocket - 生产环境端点
  WS_PUBLIC: 'wss://ws.okx.com:8443/ws/v5/public',
  WS_PRIVATE: 'wss://ws.okx.com:8443/ws/v5/private',
  WS_BUSINESS: 'wss://ws.okx.com:8443/ws/v5/business',

  // WebSocket - 模拟盘环境端点（Demo Trading）
  // 参考: https://www.okx.com/docs-v5/en/#demo-trading-services
  // 注意：模拟盘需要在模拟盘交易页面创建专用的 API Key
  WS_PUBLIC_DEMO: 'wss://wspap.okx.com:8443/ws/v5/public',
  WS_PRIVATE_DEMO: 'wss://wspap.okx.com:8443/ws/v5/private',
  WS_BUSINESS_DEMO: 'wss://wspap.okx.com:8443/ws/v5/business',

  // 兼容旧版 (保留但不推荐使用)
  DEMO_WS_PUBLIC: 'wss://wspap.okx.com:8443/ws/v5/public',   // 模拟盘
  DEMO_WS_PRIVATE: 'wss://wspap.okx.com:8443/ws/v5/private',  // 模拟盘
  LIVE_WS_PUBLIC: 'wss://ws.okx.com:8443/ws/v5/public',     // 生产环境
  LIVE_WS_PRIVATE: 'wss://ws.okx.com:8443/ws/v5/private',    // 生产环境
} as const;

// =====================================================
// 业务规则常量
// =====================================================

/**
 * 允许交易的币种白名单（7个）
 */
export const ALLOWED_COINS = [
  'BTC',
  'ETH',
  'BNB',
  'SOL',
  'XRP',
  'ADA',
  'DOGE',
] as const;

/**
 * 允许合约交易的币种（仅 BTC 和 ETH）
 */
export const SWAP_ALLOWED_COINS = [
  'BTC',
  'ETH',
] as const;

/**
 * 合约杠杆限制
 */
export const LEVERAGE_LIMITS = {
  'BTC': 5,  // BTC 合约最大 5x 杠杆
  'ETH': 3,  // ETH 合约最大 3x 杠杆
} as const;

/**
 * 禁止借币
 */
export const BORROWING_DISABLED = true;

// =====================================================
// 产品类型
// =====================================================

export const INST_TYPES = {
  SPOT: 'SPOT',      // 现货
  SWAP: 'SWAP',      // 永续合约
  MARGIN: 'MARGIN',  // 杠杆
  OPTIONS: 'OPTIONS', // 期权
} as const;

// =====================================================
// 交易模式
// =====================================================

export const TD_MODES = {
  CASH: 'cash',              // 非保证金模式（现货）
  ISOLATED: 'isolated',      // 逐仓保证金模式（合约）
  CROSS: 'cross',            // 全仓保证金模式（禁止使用）
  MARGIN: 'cash',            // 保证金模式（杠杆）
} as const;

/**
 * 根据产品类型获取推荐的交易模式
 */
export function getTdMode(instType: string): string {
  switch (instType) {
    case INST_TYPES.SPOT:
      return TD_MODES.CASH;
    case INST_TYPES.SWAP:
      return TD_MODES.ISOLATED;
    default:
      return TD_MODES.CASH;
  }
}

// =====================================================
// 订单类型
// =====================================================

export const ORDER_TYPES = {
  MARKET: 'market',       // 市价单
  LIMIT: 'limit',         // 限价单
  POST_ONLY: 'post_only', // 只挂单
  FOK: 'fok',             // 全部成交或立即取消
  IOC: 'ioc',             // 立即成交并取消剩余
} as const;

// =====================================================
// 订单状态
// =====================================================

export const ORDER_STATUS = {
  LIVE: 'live',                     // 等待成交
  PARTIALLY_FILLED: 'partially_filled', // 部分成交
  FILLED: 'filled',                 // 完全成交
  CANCELED: 'canceled',             // 已撤销
} as const;

// =====================================================
// 订单方向
// =====================================================

export const ORDER_SIDES = {
  BUY: 'buy',     // 买
  SELL: 'sell',   // 卖
} as const;

// =====================================================
// 持仓方向（仅合约）
// =====================================================

export const POSITION_SIDES = {
  LONG: 'long',   // 开多
  SHORT: 'short', // 开空
  NET: 'net',     // 双向持仓模式下的净持仓
} as const;

// =====================================================
// K 线时间粒度
// =====================================================

export const BAR_SIZES = {
  '1m': '1m',
  '3m': '3m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1H': '1H',
  '2H': '2H',
  '4H': '4H',
  '6H': '6H',
  '12H': '12H',
  '1D': '1D',
  '1W': '1W',
  '1M': '1M',
} as const;

// =====================================================
// WebSocket 操作类型
// =====================================================

export const WS_OPERATIONS = {
  LOGIN: 'login',
  SUBSCRIBE: 'subscribe',
  UNSUBSCRIBE: 'unsubscribe',
  PING: 'ping',
  PONG: 'pong',
} as const;

// =====================================================
// WebSocket 频道
// =====================================================

export const WS_CHANNELS = {
  // 账户频道
  ACCOUNT: 'account',
  POSITIONS: 'positions',
  BALANCE_AND_POSITION: 'balance_and_position',

  // 订单频道
  ORDERS: 'orders',
  ORDERS_ALGO: 'orders-algo',
  STRATEGY_ORDERS: 'strategy-orders',
  STRATEGY_ORDERS_ALGO: 'strategy-orders-algo',

  // 行情频道
  TICKERS: 'tickers',
  CANDLE_1M: 'candle1m',
  CANDLE_3M: 'candle3m',
  CANDLE_5M: 'candle5m',
  CANDLE_15M: 'candle15m',
  CANDLE_30M: 'candle30m',
  CANDLE_1H: 'candle1H',
  CANDLE_2H: 'candle2H',
  CANDLE_4H: 'candle4H',
  CANDLE_6H: 'candle6H',
  CANDLE_12H: 'candle12H',
  CANDLE_1D: 'candle1D',
  CANDLE_1W: 'candle1W',
  CANDLE_1MON: 'candle1M',

  // 深度频道
  BOOKS: 'books',
  BOOKS5: 'books5',
  BOOKS_L2_TBT: 'books-l2-tbt',
  BOOKS50_L2_TBT: 'books50-l2-tbt',

  // 交易频道
  TRADES: 'trades',
  TICKERS_CROSS: 'tickers-cross',

  // 状态频道
  STATUS: 'status',
} as const;

// =====================================================
// 通用错误码
// =====================================================

export const ERROR_CODES = {
  // 成功
  SUCCESS: '0',

  // IP 和密钥相关
  IP_RESTRICTED: '50001',
  API_KEY_EXPIRED: '50004',
  TIMESTAMP_EXPIRED: '50011',
  SIGNATURE_INVALID: '50012',
  SIGNATURE_EXPIRED: '50013',
  API_KEY_INVALID: '50014',
  API_KEY_NO_PERMISSION: '50015',
  USER_FROZEN: '50016',
  USER_DISABLED: '50017',
  REQUEST_RATE_LIMIT: '50018',
  SERVICE_TIMEOUT: '50019',
  CLIENT_REQUEST_RATE_LIMIT: '50020',
  PARAMETER_ERROR: '50021',
  TIMESTAMP_FORMAT_ERROR: '50022',
  SIGNATURE_FORMAT_ERROR: '50023',
  API_KEY_IP_RESTRICTED: '50024',

  // 交易错误
  ORDER_NOT_EXIST: '51001',
  INSUFFICIENT_BALANCE: '51002',
  ORDER_COUNT_LIMIT: '51003',
  ORDER_PRICE_LIMIT: '51004',
  PRODUCT_NOT_OPEN: '51005',
  PRODUCT_SUSPENDED: '51006',
  PRODUCT_OFFLINE: '51007',
  USER_NO_TRADE_PERMISSION: '51008',
  ORDER_COUNT_NOT_INTEGER: '51009',
  ORDER_PRICE_NOT_TICK: '51010',
  ORDER_SIZE_EXCEED_MAX: '51011',
  ORDER_SIZE_EXCEED_AVAIL: '51012',
  ORDER_PRICE_LIMIT_UP_DOWN: '51013',
  ORDER_PRICE_DEVIATE: '51014',
  ORDER_SIZE_TOO_SMALL: '51015',
  ORDER_PRICE_INVALID: '51016',
  ORDER_SIZE_INVALID: '51017',
  ORDER_TYPE_INVALID: '51018',
  ORDER_SIDE_INVALID: '51019',
  TD_MODE_INVALID: '51020',
  MGN_MODE_INVALID: '51021',
  POS_SIDE_INVALID: '51022',
  LEVER_INVALID: '51023',
  LEVER_EXCEED_LIMIT: '51024',
  CL_ORDID_EXIST: '51025',
  CL_ORDID_INVALID: '51026',
  ORDER_CANCELED: '51027',
  ORDER_FULLY_FILLED: '51028',
  ORDER_NOT_AMENDABLE: '51029',
  ORDER_NOT_CANCELLABLE: '51030',
  ORDER_SIZE_EXCEED_POS: '51031',
  CLOSE_ONLY_EXCEED_POS: '51032',
  ORDER_SIZE_EXCEED_PRODUCT: '51033',
  ORDER_PRICE_EXCEED_PRODUCT: '51034',
} as const;

/**
 * 错误码消息映射
 */
export const ERROR_MESSAGES: Record<string, string> = {
  [ERROR_CODES.SUCCESS]: '成功',
  [ERROR_CODES.IP_RESTRICTED]: 'IP 访问受限',
  [ERROR_CODES.API_KEY_EXPIRED]: 'API 密钥过期',
  [ERROR_CODES.TIMESTAMP_EXPIRED]: '时间戳过期',
  [ERROR_CODES.SIGNATURE_INVALID]: '签名无效',
  [ERROR_CODES.SIGNATURE_EXPIRED]: '签名过期',
  [ERROR_CODES.API_KEY_INVALID]: 'API 密钥无效',
  [ERROR_CODES.API_KEY_NO_PERMISSION]: 'API 密钥权限不足',
  [ERROR_CODES.USER_FROZEN]: '用户被冻结',
  [ERROR_CODES.USER_DISABLED]: '用户被禁用',
  [ERROR_CODES.REQUEST_RATE_LIMIT]: 'API 请求频率超限',
  [ERROR_CODES.SERVICE_TIMEOUT]: '服务端无响应',
  [ERROR_CODES.CLIENT_REQUEST_RATE_LIMIT]: '客户端请求频率超限',
  [ERROR_CODES.PARAMETER_ERROR]: '请求参数错误',
  [ERROR_CODES.TIMESTAMP_FORMAT_ERROR]: '时间戳格式错误',
  [ERROR_CODES.SIGNATURE_FORMAT_ERROR]: '签名格式错误',
  [ERROR_CODES.API_KEY_IP_RESTRICTED]: 'API 密钥 IP 受限',
  [ERROR_CODES.ORDER_NOT_EXIST]: '订单不存在',
  [ERROR_CODES.INSUFFICIENT_BALANCE]: '可用余额不足',
  [ERROR_CODES.ORDER_COUNT_LIMIT]: '订单数量超过限制',
  [ERROR_CODES.ORDER_PRICE_LIMIT]: '订单价格超过限制',
  [ERROR_CODES.PRODUCT_NOT_OPEN]: '产品未开放交易',
  [ERROR_CODES.PRODUCT_SUSPENDED]: '产品暂停交易',
  [ERROR_CODES.PRODUCT_OFFLINE]: '产品已下线',
  [ERROR_CODES.USER_NO_TRADE_PERMISSION]: '用户被禁止交易',
  [ERROR_CODES.ORDER_SIZE_EXCEED_AVAIL]: '订单数量超过最大可用数量',
};

// =====================================================
// 请求限制
// =====================================================

export const RATE_LIMITS = {
  REST_REQUESTS_PER_SECOND: 20,
  REST_REQUESTS_PER_2MINUTES: 120,
  WS_MAX_SUBSCRIPTIONS: 240,
} as const;

// =====================================================
// 类型导出
// =====================================================

export type AllowedCoin = typeof ALLOWED_COINS[number];
export type InstType = typeof INST_TYPES[keyof typeof INST_TYPES];
export type TdMode = typeof TD_MODES[keyof typeof TD_MODES];
export type OrderType = typeof ORDER_TYPES[keyof typeof ORDER_TYPES];
export type OrderStatus = typeof ORDER_STATUS[keyof typeof ORDER_STATUS];
export type OrderSide = typeof ORDER_SIDES[keyof typeof ORDER_SIDES];
export type PositionSide = typeof POSITION_SIDES[keyof typeof POSITION_SIDES];
export type BarSize = keyof typeof BAR_SIZES;
export type WsOperation = typeof WS_OPERATIONS[keyof typeof WS_OPERATIONS];
export type WsChannel = typeof WS_CHANNELS[keyof typeof WS_CHANNELS];
