/**
 * 手续费计算器
 *
 * 计算OKX现货和合约的手续费，支持VIP等级折扣
 * 帮助交易者理解手续费对盈利的影响
 */

/**
 * 交易类型
 */
export enum TradeType {
  /** 现货 */
  SPOT = 'SPOT',
  /** 永续合约 */
  PERPETUAL = 'PERPETUAL',
  /** 交割合约 */
  DELIVERY = 'DELIVERY',
}

/**
 * 订单类型
 */
export enum OrderType {
  /** 限价单（Maker，挂单） */
  LIMIT = 'LIMIT',
  /** 市价单（Taker，吃单） */
  MARKET = 'MARKET',
}

/**
 * 手续费计算结果
 */
export interface FeeCalculationResult {
  /** 开仓手续费 */
  openFee: number;
  /** 平仓手续费 */
  closeFee: number;
  /** 总手续费 */
  totalFee: number;
  /** 总手续费率 */
  totalFeeRate: number;
  /** 原始盈亏（不含手续费） */
  grossPnL: number;
  /** 实际盈亏（含手续费） */
  netPnL: number;
  /** 净利润率 */
  netProfitRate: number;
  /** 盈亏平衡所需的涨跌幅 */
  breakEvenMove: number;
}

/**
 * VIP等级配置
 */
interface VIPLevelConfig {
  level: number;
  spotMaker: number;
  spotTaker: number;
  futureMaker: number;
  futureTaker: number;
  minVolume: number;  // 30天交易量（USDT）
}

/**
 * OKX VIP等级和手续费率
 */
const VIP_LEVELS: VIPLevelConfig[] = [
  { level: 0, spotMaker: 0.0008, spotTaker: 0.0010, futureMaker: 0.0002, futureTaker: 0.0005, minVolume: 0 },
  { level: 1, spotMaker: 0.0007, spotTaker: 0.0010, futureMaker: 0.00015, futureTaker: 0.0005, minVolume: 1000000 },
  { level: 2, spotMaker: 0.0006, spotTaker: 0.0010, futureMaker: 0.00010, futureTaker: 0.0005, minVolume: 5000000 },
  { level: 3, spotMaker: 0.0005, spotTaker: 0.0010, futureMaker: 0.00005, futureTaker: 0.0005, minVolume: 10000000 },
  { level: 4, spotMaker: 0.0003, spotTaker: 0.0006, futureMaker: 0.00002, futureTaker: 0.0003, minVolume: 20000000 },
  { level: 5, spotMaker: 0.0000, spotTaker: 0.0005, futureMaker: 0.00000, futureTaker: 0.0002, minVolume: 50000000 },
];

/**
 * 手续费计算器
 */
export class FeeCalculator {
  private readonly vipLevel: number;
  private readonly feeRates: VIPLevelConfig;

  constructor(vipLevel: number = 0) {
    // 确保VIP等级在有效范围内
    this.vipLevel = Math.max(0, Math.min(5, vipLevel));
    this.feeRates = VIP_LEVELS[this.vipLevel];
  }

  /**
   * 计算交易手续费和盈亏
   */
  calculateTrade(
    entryPrice: number,
    exitPrice: number,
    positionSize: number,  // USDT金额
    tradeType: TradeType,
    orderType: OrderType = OrderType.LIMIT
  ): FeeCalculationResult {
    // 获取手续费率
    const { maker, taker } = this.getFeeRates(tradeType);
    const feeRate = orderType === OrderType.LIMIT ? maker : taker;

    // 计算原始盈亏
    const grossPnL = (exitPrice - entryPrice) * positionSize / entryPrice;

    // 计算手续费
    const openFee = positionSize * feeRate;
    const closeFee = (positionSize + grossPnL) * feeRate;
    const totalFee = openFee + closeFee;

    // 计算实际盈亏
    const netPnL = grossPnL - totalFee;

    // 计算利润率
    const netProfitRate = netPnL / positionSize;
    const totalFeeRate = totalFee / positionSize;

    // 计算盈亏平衡所需的涨跌幅
    const breakEvenMove = this.calculateBreakEven(tradeType, orderType);

    return {
      openFee,
      closeFee,
      totalFee,
      totalFeeRate,
      grossPnL,
      netPnL,
      netProfitRate,
      breakEvenMove,
    };
  }

  /**
   * 计算盈亏平衡所需的涨跌幅
   */
  calculateBreakEven(
    tradeType: TradeType,
    orderType: OrderType = OrderType.LIMIT
  ): number {
    const { maker, taker } = this.getFeeRates(tradeType);
    const feeRate = orderType === OrderType.LIMIT ? maker : taker;

    // 来回手续费
    // 开仓：positionSize * feeRate
    // 平仓：positionSize * (1 + profit) * feeRate
    // 盈亏平衡：profit = feeRate + feeRate * (1 + profit)
    // profit * (1 - feeRate) = 2 * feeRate
    // profit = 2 * feeRate / (1 - feeRate)

    return (2 * feeRate) / (1 - feeRate);
  }

  /**
   * 计算给定利润目标下的实际利润率
   */
  calculateNetProfit(
    targetProfitRate: number,  // 目标利润率（如0.02=2%）
    tradeType: TradeType,
    orderType: OrderType = OrderType.LIMIT
  ): number {
    const { maker, taker } = this.getFeeRates(tradeType);
    const feeRate = orderType === OrderType.LIMIT ? maker : taker;

    // 开仓手续费
    const openFee = feeRate;

    // 平仓手续费（含利润）
    const closeFee = (1 + targetProfitRate) * feeRate;

    // 净利润率
    return targetProfitRate - openFee - closeFee;
  }

  /**
   * 根据手续费率判断交易是否值得
   */
  isTradeWorthwhile(
    expectedProfitRate: number,
    tradeType: TradeType,
    orderType: OrderType = OrderType.LIMIT,
    minNetProfit: number = 0.001  // 最小净利润0.1%
  ): boolean {
    const netProfit = this.calculateNetProfit(expectedProfitRate, tradeType, orderType);
    return netProfit >= minNetProfit;
  }

  /**
   * 计算达到目标净利润所需的毛利润
   */
  calculateRequiredGrossProfit(
    targetNetProfit: number,
    tradeType: TradeType,
    orderType: OrderType = OrderType.LIMIT
  ): number {
    const { maker, taker } = this.getFeeRates(tradeType);
    const feeRate = orderType === OrderType.LIMIT ? maker : taker;

    // netProfit = grossProfit - feeRate - (1 + grossProfit) * feeRate
    // netProfit = grossProfit - 2 * feeRate - grossProfit * feeRate
    // netProfit + 2 * feeRate = grossProfit * (1 - feeRate)
    // grossProfit = (netProfit + 2 * feeRate) / (1 - feeRate)

    return (targetNetProfit + 2 * feeRate) / (1 - feeRate);
  }

  /**
   * 获取手续费率
   */
  private getFeeRates(tradeType: TradeType): { maker: number; taker: number } {
    if (tradeType === TradeType.SPOT) {
      return {
        maker: this.feeRates.spotMaker,
        taker: this.feeRates.spotTaker,
      };
    } else {
      return {
        maker: this.feeRates.futureMaker,
        taker: this.feeRates.futureTaker,
      };
    }
  }

  /**
   * 获取VIP等级信息
   */
  getVIPInfo(): VIPLevelConfig {
    return { ...this.feeRates };
  }

  /**
   * 生成手续费对比报告
   */
  generateComparisonReport(
    positionSize: number,
    profitRates: number[] = [0.002, 0.005, 0.01, 0.02, 0.03]
  ): string {
    let report = '\n=== 手续费对比报告 ===\n';
    report += `VIP等级: ${this.vipLevel}\n`;
    report += `资金量: ${positionSize} USDT\n`;
    report += `现货Maker费率: ${(this.feeRates.spotMaker * 100).toFixed(3)}%\n`;
    report += `合约Maker费率: ${(this.feeRates.futureMaker * 100).toFixed(3)}%\n\n`;

    report += '不同利润目标下的实际净利润:\n\n';
    report += '目标利润 | 现货净利润 | 合约净利润 | 现货胜率要求 | 合约胜率要求\n';
    report += '---------|-----------|-----------|-------------|-------------\n';

    for (const profitRate of profitRates) {
      const spotNet = this.calculateNetProfit(profitRate, TradeType.SPOT);
      const futureNet = this.calculateNetProfit(profitRate, TradeType.PERPETUAL);

      // 计算盈亏平衡胜率
      const spotBreakEven = this.calculateBreakEven(TradeType.SPOT);
      const futureBreakEven = this.calculateBreakEven(TradeType.PERPETUAL);
      const spotWinRate = (spotBreakEven / profitRate * 100).toFixed(0);
      const futureWinRate = (futureBreakEven / profitRate * 100).toFixed(0);

      report += `${(profitRate * 100).toFixed(1).padStart(7)}% | `;
      report += `${(spotNet * 100).toFixed(2).padStart(9)}% | `;
      report += `${(futureNet * 100).toFixed(2).padStart(9)}% | `;
      report += `${spotWinRate.padStart(10)}% | `;
      report += `${futureWinRate.padStart(10)}%\n`;
    }

    return report;
  }
}

/**
 * 根据交易量估算VIP等级
 */
export function estimateVIPLevel(tradingVolume30Days: number): number {
  for (let i = VIP_LEVELS.length - 1; i >= 0; i--) {
    if (tradingVolume30Days >= VIP_LEVELS[i].minVolume) {
      return VIP_LEVELS[i].level;
    }
  }
  return 0;
}

/**
 * 计算达到指定VIP等级所需的交易量
 */
export function calculateVolumeForVIP(targetLevel: number): number {
  if (targetLevel < 1 || targetLevel > 5) {
    throw new Error('VIP等级必须在1-5之间');
  }
  return VIP_LEVELS[targetLevel].minVolume;
}
