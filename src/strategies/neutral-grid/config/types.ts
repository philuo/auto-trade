/**
 * 中性合约网格策略类型定义
 *
 * 适用于：BTC (5x杠杆)、ETH (3x杠杆) 的永续合约交易
 * 核心理念：做多做空同时进行，对冲单边风险，赚取波动收益
 */

// =====================================================
// 基础类型
// =====================================================

export type SwapAllowedCoin = 'BTC' | 'ETH';

export interface NeutralGridConfig {
  base: BaseConfig;
  capital: CapitalConfig;
  coins: CoinsConfig;
  grid: NeutralGridConfigOptions;
  risk: RiskConfig;
  funding: FundingRateConfig;
}

export interface BaseConfig {
  strategyName: string;
  version: string;
  enabled: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

// =====================================================
// 资金配置
// =====================================================

export interface CapitalConfig {
  totalCapital: number;           // 总资金 (USDT)
  emergencyReserve: number;        // 应急储备百分比
  maxCapitalPerCoin: number;       // 单币种最大资金百分比
  leverage: {
    [key in SwapAllowedCoin]: number;  // BTC: 5x, ETH: 3x
  };
}

// =====================================================
// 币种配置
// =====================================================

export interface CoinsConfig {
  allowedCoins: SwapAllowedCoin[];
  activeCoinLimit: number;
}

// =====================================================
// 中性网格配置
// =====================================================

export interface NeutralGridConfigOptions {
  enabled: boolean;

  // 价格区间
  rangeCalculation: {
    mode: 'fixed' | 'adaptive' | 'bollinger';
    centerPrice: 'current' | 'sma' | 'ema';
    upperRange: number;            // 上界百分比
    lowerRange: number;            // 下界百分比
    adjustOnBreakout: boolean;     // 突破后调整
  };

  // 网格设置
  gridSettings: {
    gridCount: number;             // 网格数量
    spacing: 'arithmetic' | 'geometric';
    geometricRatio?: number;       // 几何间距比例
  };

  // 订单设置
  orderSettings: {
    sizeType: 'fixed' | 'percentage';
    size: number;                  // 固定大小或百分比
    maxSizePerLevel: number;       // 单层最大仓位
  };

  // 仓位平衡
  balance: {
    threshold: number;             // 不平衡阈值 (%)
    rebalanceMode: 'auto' | 'manual';
    rebalanceInterval: number;     // 再平衡间隔（小时）
  };

  // 行为设置
  behavior: {
    closeOnRangeBreak: boolean;    // 突破区间时平仓
    trailOnBreakout: boolean;      // 突破后跟踪
    trailDistance: number;         // 跟踪距离 (%)
  };
}

// =====================================================
// 风险管理配置
// =====================================================

export interface RiskConfig {
  // 止损配置
  stopLoss: {
    enabled: boolean;
    maxDrawdown: number;           // 最大回撤 (%)
    positionLossLimit: number;     // 单边仓位损失限制 (%)
  };

  // 仓位控制
  position: {
    maxOpenPositions: number;      // 最大开仓数量
    maxPositionValue: number;      // 单边最大仓位价值
    minMarginRatio: number;        // 最小保证金率 (%)
  };

  // 杠杆风险
  leverage: {
    maxLeverageBTC: number;        // BTC 最大杠杆
    maxLeverageETH: number;        // ETH 最大杠杆
    autoReduceLeverage: boolean;   // 接近强平时自动降杠杆
  };

  // 资金费率风险
  funding: {
    maxFundingRate: number;        // 最大可接受资金费率 (%)
    hedgeOnHighFunding: boolean;   // 高费率时对冲
  };
}

// =====================================================
// 资金费率配置
// =====================================================

export interface FundingRateConfig {
  // 资金费率套利
  arbitrage: {
    enabled: boolean;
    threshold: number;             // 套利阈值 (%)
    minProfit: number;             // 最小利润 (%)
  };

  // 监控设置
  monitoring: {
    checkInterval: number;         // 检查间隔（分钟）
    alertOnHighRate: boolean;      // 高费率告警
  };
}

// =====================================================
// 运行时状态
// =====================================================

export interface NeutralGridState {
  config: NeutralGridConfig;
  coins: Map<SwapAllowedCoin, CoinGridState>;
  totalEquity: number;
  peakEquity: number;
  currentDrawdown: number;
  totalPnL: number;
  totalFundingFee: number;
  startTime: number;
  lastUpdateTime: number;
}

export interface CoinGridState {
  coin: SwapAllowedCoin;
  enabled: boolean;
  allocatedCapital: number;
  leverage: number;

  // 价格区间
  priceRange: {
    upper: number;
    lower: number;
    center: number;
    lastUpdate: number;
  };

  // 当前价格
  currentPrice: number;

  // 仓位信息
  longPosition: PositionSide;
  shortPosition: PositionSide;

  // 网格订单
  gridOrders: GridOrder[];

  // 统计
  totalTrades: number;
  totalPnL: number;
  fundingPaid: number;
  fundingReceived: number;
  lastRebalance: number;
}

export interface PositionSide {
  size: number;                    // 仓位大小（张）
  value: number;                   // 仓位价值（USDT）
  avgPrice: number;                // 平均开仓价
  unrealizedPnL: number;           // 未实现盈亏
  liquidationPrice: number;        // 强平价格
}

export interface GridOrder {
  id: string;
  side: 'buy' | 'sell';
  price: number;
  size: number;
  type: 'long' | 'short';
  status: 'pending' | 'open' | 'filled' | 'canceled';
  timestamp: number;
}

// =====================================================
// 市场数据
// =====================================================

export interface SwapMarketData {
  coin: SwapAllowedCoin;
  symbol: string;
  timestamp: number;
  price: number;
  bidPrice: number;
  askPrice: number;
  volume24h: number;
  change24h: number;
  changePercent24h: number;
  high24h: number;
  low24h: number;
  fundingRate: number;             // 当前资金费率
  nextFundingTime: number;         // 下次资金费时间
  markPrice: number;               // 标记价格
  indexPrice: number;              // 指数价格
}

// =====================================================
// 交易决策
// =====================================================

export interface NeutralGridDecision {
  coin: SwapAllowedCoin;
  action: 'hold' | 'open_long' | 'open_short' | 'close_long' | 'close_short' | 'rebalance' | 'pause' | 'emergency';
  type: 'grid' | 'rebalance' | 'risk' | 'funding';
  reason: string;
  size?: number;
  price?: number;
  timestamp: number;
}

// =====================================================
// 手续费计算
// =====================================================

export interface FeeCalculation {
  makerFee: number;                // Maker 手续费率 (%)
  takerFee: number;                // Taker 手续费率 (%)
  fundingRate: number;             // 资金费率 (%)

  // 计算结果
  tradingFees: number;             // 交易手续费
  fundingFees: number;             // 资金费用
  netProfit: number;               // 净利润（扣除费用后）

  // 统计
  tradeCount: number;
  makerRatio: number;              // Maker 订单比例
}

// =====================================================
// 性能指标
// =====================================================

export interface PerformanceMetrics {
  totalReturn: number;             // 总收益率
  sharpeRatio: number;             // 夏普比率
  maxDrawdown: number;             // 最大回撤
  winRate: number;                 // 胜率
  profitFactor: number;            // 盈亏比
  averageWin: number;              // 平均盈利
  averageLoss: number;             // 平均亏损
  totalTrades: number;             // 总交易次数
  profitableTrades: number;        // 盈利交易次数
  losingTrades: number;            // 亏损交易次数
}
