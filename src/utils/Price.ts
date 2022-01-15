import {
    BALANCERVAULT_CONTRACT,
    MONOLITHPOOLID,
    SLP_EXODDAI_PAIR, SLP_WFTMUSDC_PAIR, STAKING_CONTRACT_V2, THEMONOLITHPOOL_CONTRACT, WETH_ERC20_CONTRACT, WSOHM_ERC20_CONTRACT
} from './Constants'
import { Address, BigDecimal, BigInt, Bytes, log } from '@graphprotocol/graph-ts'
import { UniswapV2Pair } from '../../generated/OlympusStakingV2/UniswapV2Pair';
import { toDecimal } from './Decimals'
import { BalancerVault } from '../../generated/OlympusStakingV2/BalancerVault';
import { WeightedPool } from '../../generated/OlympusStakingV2/WeightedPool';
import { OlympusStakingV2 } from '../../generated/OlympusStakingV2/OlympusStakingV2';
import { getMonolithInfo } from './ProtocolMetrics';


let BIG_DECIMAL_1E9 = BigDecimal.fromString('1e9')
let BIG_DECIMAL_1E12 = BigDecimal.fromString('1e12')

export function getETHUSDRate(): BigDecimal {
    let pair = UniswapV2Pair.bind(Address.fromString(SLP_WFTMUSDC_PAIR))

    let reserves = pair.getReserves()
    let reserve0 = reserves.value0.toBigDecimal()
    let reserve1 = reserves.value1.toBigDecimal()

    let ethRate = reserve0.div(reserve1).times(BIG_DECIMAL_1E12)
    log.debug("ETH rate {}", [ethRate.toString()])

    return ethRate
}

export function getOHMUSDRate(): BigDecimal {
    let pair = UniswapV2Pair.bind(Address.fromString(SLP_EXODDAI_PAIR))

    let reserves = pair.getReserves()
    let reserve0 = reserves.value0.toBigDecimal()
    let reserve1 = reserves.value1.toBigDecimal()

    let ohmRate = reserve1.div(reserve0).div(BIG_DECIMAL_1E9)
    log.debug("OHM rate {}", [ohmRate.toString()])

    return ohmRate
}

//(slp_treasury/slp_supply)*(2*sqrt(lp_dai * lp_ohm))
export function getDiscountedPairUSD(lp_amount: BigInt, pair_adress: string): BigDecimal{
    let pair = UniswapV2Pair.bind(Address.fromString(pair_adress))

    let total_lp = pair.totalSupply()
    let lp_token_1 = toDecimal(pair.getReserves().value0, 9)
    let lp_token_2 = toDecimal(pair.getReserves().value1, 18)
    let kLast = lp_token_1.times(lp_token_2).truncate(0).digits

    let part1 = toDecimal(lp_amount,18).div(toDecimal(total_lp,18))
    let two = BigInt.fromI32(2)

    let sqrt = kLast.sqrt();
    let part2 = toDecimal(two.times(sqrt), 0)
    let result = part1.times(part2)
    return result
}

export function getPairUSD(lp_amount: BigInt, pair_adress: string): BigDecimal{
    let pair = UniswapV2Pair.bind(Address.fromString(pair_adress))
    let total_lp = pair.totalSupply()
    let lp_token_0 = pair.getReserves().value0
    let lp_token_1 = pair.getReserves().value1
    let ownedLP = toDecimal(lp_amount,18).div(toDecimal(total_lp,18))
    let ohm_value = toDecimal(lp_token_0, 9).times(getOHMUSDRate())
    let total_lp_usd = ohm_value.plus(toDecimal(lp_token_1, 18))

    return ownedLP.times(total_lp_usd)
}

export function getPairWETH(lp_amount: BigInt, pair_adress: string): BigDecimal{
    let pair = UniswapV2Pair.bind(Address.fromString(pair_adress))
    let total_lp = pair.totalSupply()
    let lp_token_0 = pair.getReserves().value0
    let lp_token_1 = pair.getReserves().value1
    let ownedLP = toDecimal(lp_amount,18).div(toDecimal(total_lp,18))
    let ohm_value = toDecimal(lp_token_0, 9).times(getOHMUSDRate())
    let eth_value = toDecimal(lp_token_1, 18).times(getETHUSDRate())
    let total_lp_usd = ohm_value.plus(eth_value)

    return ownedLP.times(total_lp_usd)
}

export function getMonolithUSD(bpt_amount: BigInt): BigDecimal {
    const indexContract = OlympusStakingV2.bind(Address.fromString(STAKING_CONTRACT_V2));
    const index = toDecimal(indexContract.index(), 9);
    const monolithPoolContract = WeightedPool.bind(Address.fromString(THEMONOLITHPOOL_CONTRACT))
    const monolithTotalSupply = toDecimal(monolithPoolContract.totalSupply(), 18)
    const balancerVaultContract = BalancerVault.bind(Address.fromString(BALANCERVAULT_CONTRACT))
    const monolithPoolTokens = balancerVaultContract.getPoolTokens(Bytes.fromByteArray(Bytes.fromHexString(MONOLITHPOOLID)));
    const tokenAddresses = monolithPoolTokens.value0
    const tokenBalances = monolithPoolTokens.value1
    const ownedBPT = toDecimal(bpt_amount, 18).div(monolithTotalSupply)

    const monolithInfo = getMonolithInfo(tokenAddresses, tokenBalances, ownedBPT, index)

    return monolithInfo.monolithMaiValue.plus(monolithInfo.monolithExodValue).plus(monolithInfo.monolithWsExodValue).plus(monolithInfo.monolithWFtmValue).plus(monolithInfo.monolithGOhmValue)
}
