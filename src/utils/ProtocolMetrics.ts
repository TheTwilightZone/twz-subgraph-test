import { Address, BigDecimal, BigInt, ByteArray, Bytes, log} from '@graphprotocol/graph-ts'
import { OlympusERC20 } from '../../generated/OlympusStakingV2/OlympusERC20';
import { sOlympusERC20V2 } from '../../generated/OlympusStakingV2/sOlympusERC20V2';
import { CirculatingSupply } from '../../generated/OlympusStakingV2/CirculatingSupply';
import { ERC20 } from '../../generated/OlympusStakingV2/ERC20';
import { UniswapV2Pair } from '../../generated/OlympusStakingV2/UniswapV2Pair';
import { OlympusStakingV2 } from '../../generated/OlympusStakingV2/OlympusStakingV2';

import { ProtocolMetric, Transaction } from '../../generated/schema'
import { CIRCULATING_SUPPLY_CONTRACT, CIRCULATING_SUPPLY_CONTRACT_BLOCK, ERC20DAI_CONTRACT, OHM_ERC20_CONTRACT, SOHM_ERC20_CONTRACTV2, STAKING_CONTRACT_V2, SLP_EXODDAI_PAIR, TREASURY_ADDRESS_V2, WETH_ERC20_CONTRACT, GOHM_ERC20_CONTRACT, MAI_ERC20_CONTRACT, THEMONOLITHPOOL_CONTRACT, BALANCERVAULT_CONTRACT, MONOLITHPOOLID, WSOHM_ERC20_CONTRACT } from './Constants';
import { dayFromTimestamp } from './Dates';
import { toDecimal } from './Decimals';
import { getOHMUSDRate, getDiscountedPairUSD, getPairUSD, getETHUSDRate } from './Price';
import { getHolderAux } from './_Aux';
import { updateBondDiscounts } from './BondDiscounts';
import { GOhmERC20 } from '../../generated/sOlympusERC20V2/GOhmERC20';
import { WeightedPool } from '../../generated/OlympusStakingV2/WeightedPool';
import { BalancerVault } from '../../generated/OlympusStakingV2/BalancerVault';

export function loadOrCreateProtocolMetric(timestamp: BigInt): ProtocolMetric{
    let dayTimestamp = dayFromTimestamp(timestamp);

    let protocolMetric = ProtocolMetric.load(dayTimestamp)
    if (protocolMetric == null) {
        protocolMetric = new ProtocolMetric(dayTimestamp)
        protocolMetric.timestamp = timestamp
        protocolMetric.ohmCirculatingSupply = BigDecimal.fromString("0")
        protocolMetric.sOhmCirculatingSupply = BigDecimal.fromString("0")
        protocolMetric.totalSupply = BigDecimal.fromString("0")
        protocolMetric.ohmPrice = BigDecimal.fromString("0")
        protocolMetric.marketCap = BigDecimal.fromString("0")
        protocolMetric.totalValueLocked = BigDecimal.fromString("0")
        protocolMetric.treasuryRiskFreeValue = BigDecimal.fromString("0")
        protocolMetric.treasuryMarketValue = BigDecimal.fromString("0")
        protocolMetric.nextEpochRebase = BigDecimal.fromString("0")
        protocolMetric.nextDistributedOhm = BigDecimal.fromString("0")
        protocolMetric.currentAPY = BigDecimal.fromString("0")
        protocolMetric.treasuryDaiRiskFreeValue = BigDecimal.fromString("0")
        protocolMetric.treasuryDaiMarketValue = BigDecimal.fromString("0")
        protocolMetric.treasuryWETHRiskFreeValue = BigDecimal.fromString("0")
        protocolMetric.treasuryWETHMarketValue = BigDecimal.fromString("0")
        protocolMetric.treasuryOhmDaiPOL = BigDecimal.fromString("0")
        protocolMetric.treasuryGOhmBalance = BigDecimal.fromString("0")
        protocolMetric.holders = BigInt.fromI32(0)
        protocolMetric.index = BigDecimal.fromString("0")
        protocolMetric.ohmMinted = BigDecimal.fromString("0")
        protocolMetric.ohmMintedDao = BigDecimal.fromString("0")

        protocolMetric.save()
    }
    return protocolMetric as ProtocolMetric
}


function getTotalSupply(): BigDecimal{
    let ohm_contract = OlympusERC20.bind(Address.fromString(OHM_ERC20_CONTRACT))
    let total_supply = toDecimal(ohm_contract.totalSupply(), 9)
    log.debug("Total Supply {}", [total_supply.toString()])
    return total_supply
}

function getCriculatingSupply(transaction: Transaction, total_supply: BigDecimal): BigDecimal{
    let circ_supply = BigDecimal.fromString("0")
    if(transaction.blockNumber.gt(BigInt.fromString(CIRCULATING_SUPPLY_CONTRACT_BLOCK))){
        let circulatingsupply_contract = CirculatingSupply.bind(Address.fromString(CIRCULATING_SUPPLY_CONTRACT))
        circ_supply = toDecimal(circulatingsupply_contract.OHMCirculatingSupply(), 9)
    }
    else{
        circ_supply = total_supply;
    }
    log.debug("Circulating Supply {}", [total_supply.toString()])
    return circ_supply
}

function getSohmSupply(transaction: Transaction): BigDecimal{
    let sohm_contract_v2 = sOlympusERC20V2.bind(Address.fromString(SOHM_ERC20_CONTRACTV2))
    let sohm_supply = toDecimal(sohm_contract_v2.circulatingSupply(), 9)


    log.debug("sOHM Supply {}", [sohm_supply.toString()])
    return sohm_supply
}

class MonolithPool {
    monolithMaiValue: BigDecimal;
    monolithMaiBalance: BigDecimal;
    monolithExodValue: BigDecimal;
    monolithExodBalance: BigDecimal;
    monolithWsExodValue: BigDecimal;
    monolithWsExodBalance: BigDecimal;
    monolithWFtmValue: BigDecimal;
    monolithWFtmBalance: BigDecimal;
    monolithGOhmBalance: BigDecimal;
    monolithGOhmValue: BigDecimal;
}

export function getMonolithInfo(tokenAddresses: Address[], tokenBalances: BigInt[], ownedMonolithRatio: BigDecimal, index: BigDecimal): MonolithPool {
    const exodPrice = getOHMUSDRate();

    let monolithMaiValue: BigDecimal;
    let monolithMaiBalance: BigDecimal;
    let monolithExodValue: BigDecimal;
    let monolithExodBalance: BigDecimal;
    let monolithWsExodValue: BigDecimal;
    let monolithWsExodBalance: BigDecimal;
    let monolithWFtmValue: BigDecimal;
    let monolithWFtmBalance: BigDecimal;
    let monolithGOhmBalance: BigDecimal;
    let monolithGOhmValue: BigDecimal;

    for (let i=0; i<tokenAddresses.length; i++) {
        if (tokenAddresses[i].equals(ByteArray.fromHexString(MAI_ERC20_CONTRACT))) {
            monolithMaiBalance = toDecimal(tokenBalances[i], 18).times(ownedMonolithRatio)
            monolithMaiValue = monolithMaiBalance
        } else if (tokenAddresses[i].equals(ByteArray.fromHexString(OHM_ERC20_CONTRACT))) {
            monolithExodBalance = toDecimal(tokenBalances[i], 9).times(ownedMonolithRatio)
            monolithExodValue = monolithExodBalance.times(exodPrice)
        } else if (tokenAddresses[i].equals(ByteArray.fromHexString(WSOHM_ERC20_CONTRACT))) {
            monolithWsExodBalance = toDecimal(tokenBalances[i], 18).times(ownedMonolithRatio)
            monolithWsExodValue = monolithWsExodBalance.times(index).times(exodPrice)
        } else if (tokenAddresses[i].equals(ByteArray.fromHexString(WETH_ERC20_CONTRACT))) {
            monolithWFtmBalance = toDecimal(tokenBalances[i], 18).times(ownedMonolithRatio)
            monolithWFtmValue = monolithWFtmBalance.times(getETHUSDRate())
        } else if (tokenAddresses[i].equals(ByteArray.fromHexString(GOHM_ERC20_CONTRACT))) {
            monolithGOhmBalance = toDecimal(tokenBalances[i], 18).times(ownedMonolithRatio)
        }
    }
    monolithGOhmValue = monolithMaiValue

    return {
        monolithMaiValue,
        monolithMaiBalance,
        monolithExodValue,
        monolithExodBalance,
        monolithWsExodValue,
        monolithWsExodBalance,
        monolithWFtmValue,
        monolithWFtmBalance,
        monolithGOhmValue,
        monolithGOhmBalance,
    }
}

function getAveragePol(slpBalance: BigDecimal, slpTotalSupply: BigDecimal, monolithBalance: BigDecimal, monolithTotalSupply: BigDecimal):BigDecimal {
    return ( 
        slpBalance.plus(monolithBalance)
        .div(
            slpTotalSupply.plus(monolithTotalSupply)
        )
        .times(BigDecimal.fromString("100"))
    )
}

class ITreasury {
    mv: BigDecimal;
    rfv: BigDecimal;
    DaiRfv: BigDecimal;
    DaiMv: BigDecimal;
    wethRfv: BigDecimal;
    wethValue: BigDecimal;
    ohmdaiPOL: BigDecimal;
    monolithPOL: BigDecimal;
    averagePOL: BigDecimal;
    gOhmBalance: BigDecimal;
    gOhmValue: BigDecimal;
    maiBalance: BigDecimal;
    maiRfv: BigDecimal;
    monolithTotalPoolMv: BigDecimal;
    monolithMaiValue: BigDecimal;
    monolithMaiBalance: BigDecimal;
    monolithExodValue: BigDecimal;
    monolithExodBalance: BigDecimal;
    monolithWsExodValue: BigDecimal;
    monolithWsExodBalance: BigDecimal;
    monolithWFtmValue: BigDecimal;
    monolithWFtmBalance: BigDecimal;
    monolithGOhmValue: BigDecimal;
    monolithGOhmBalance: BigDecimal;
    index: BigDecimal;
}

function getMV_RFV(transaction: Transaction): ITreasury{
    let daiERC20 = ERC20.bind(Address.fromString(ERC20DAI_CONTRACT))
    let wethERC20 = ERC20.bind(Address.fromString(WETH_ERC20_CONTRACT))

    let ohmdaiPair = UniswapV2Pair.bind(Address.fromString(SLP_EXODDAI_PAIR))

    let treasury_address = TREASURY_ADDRESS_V2;

    let daiBalance = toDecimal(daiERC20.balanceOf(Address.fromString(treasury_address)), 18)
    let wethBalance = toDecimal(wethERC20.balanceOf(Address.fromString(treasury_address)), 18)
    let weth_value = wethBalance.times(getETHUSDRate())

    let ohmdaiBalance = ohmdaiPair.balanceOf(Address.fromString(treasury_address))
    let ohmdaiTotalLP = toDecimal(ohmdaiPair.totalSupply(), 18)
    let ohmdaiPOL = toDecimal(ohmdaiBalance, 18).div(ohmdaiTotalLP).times(BigDecimal.fromString("100"))
    let ohmdai_value = getPairUSD(ohmdaiBalance, SLP_EXODDAI_PAIR)
    let ohmdai_rfv = getDiscountedPairUSD(ohmdaiBalance, SLP_EXODDAI_PAIR)

    const maiERC20 = ERC20.bind(Address.fromString(MAI_ERC20_CONTRACT))
    const maiBalance = toDecimal(maiERC20.balanceOf(Address.fromString(treasury_address)),18);

    const gOhmContract = GOhmERC20.bind(Address.fromString(GOHM_ERC20_CONTRACT))
    const gOhmBalance = toDecimal(gOhmContract.balanceOf(Address.fromString(treasury_address)), 18);

    let indexContract = OlympusStakingV2.bind(Address.fromString(STAKING_CONTRACT_V2));
    const index = toDecimal(indexContract.index(), 9);

    const monolithPoolContract = WeightedPool.bind(Address.fromString(THEMONOLITHPOOL_CONTRACT))
    const monolithBalance = toDecimal(monolithPoolContract.balanceOf(Address.fromString(TREASURY_ADDRESS_V2)), 18)
    const monolithTotalSupply = toDecimal(monolithPoolContract.totalSupply(), 18)
    const treasuryOwnedMonolithRatio = monolithBalance.div(monolithTotalSupply)
    const monolithPOL = treasuryOwnedMonolithRatio.times(BigDecimal.fromString("100"))
    const averagePOL = getAveragePol(toDecimal(ohmdaiBalance, 18), ohmdaiTotalLP, monolithBalance, monolithTotalSupply)

    const balancerVaultContract = BalancerVault.bind(Address.fromString(BALANCERVAULT_CONTRACT))
    const monolithPoolTokens = balancerVaultContract.getPoolTokens(Bytes.fromByteArray(Bytes.fromHexString(MONOLITHPOOLID)));
    const monolithAddresses = monolithPoolTokens.value0
    const monolithBalances = monolithPoolTokens.value1

    const monolithInfo = getMonolithInfo(monolithAddresses, monolithBalances, treasuryOwnedMonolithRatio, index)
    const monolithMaiValue = monolithInfo.monolithMaiValue
    const monolithMaiBalance = monolithInfo.monolithMaiBalance
    const monolithExodValue = monolithInfo.monolithExodValue
    const monolithExodBalance = monolithInfo.monolithExodBalance
    const monolithWsExodValue = monolithInfo.monolithWsExodValue
    const monolithWsExodBalance = monolithInfo.monolithWsExodBalance
    const monolithGOhmValue = monolithInfo.monolithGOhmValue
    const monolithGOhmBalance = monolithInfo.monolithGOhmBalance
    const monolithWFtmValue = monolithInfo.monolithWFtmValue
    const monolithWFtmBalance = monolithInfo.monolithWFtmBalance

    const gohmPrice = monolithGOhmValue.div(monolithGOhmBalance);
    const totalGOhmBalance = gOhmBalance.plus(monolithGOhmBalance);
    const totalGohmValue = gohmPrice.times(totalGOhmBalance);
    const monolithTotalPoolMv = monolithMaiValue.plus(monolithExodValue).plus(monolithWsExodValue).plus(monolithWFtmValue).plus(monolithGOhmValue)

    const totalMaiBalance = maiBalance.plus(monolithMaiBalance);
    let stableValue = daiBalance.plus(maiBalance);

    let lpValue = ohmdai_value
    let rfvLpValue = ohmdai_rfv

    let mv = stableValue.plus(lpValue).plus(weth_value).plus(gOhmBalance.times(gohmPrice)).plus(monolithTotalPoolMv)
    let rfv = stableValue.plus(rfvLpValue)

    log.debug("Treasury Market Value {}", [mv.toString()])
    log.debug("Treasury RFV {}", [rfv.toString()])
    log.debug("Treasury DAI value {}", [daiBalance.toString()])
    log.debug("Treasury WETH value {}", [weth_value.toString()])
    log.debug("Treasury OHM-DAI RFV {}", [ohmdai_rfv.toString()])

    return {
        mv,
        rfv,
        // treasuryDaiRiskFreeValue = DAI RFV * DAI + aDAI
        DaiRfv: ohmdai_rfv.plus(daiBalance),
        // treasuryDaiMarketValue = DAI LP * DAI + aDAI
        DaiMv: ohmdai_value.plus(daiBalance),
        wethRfv: weth_value.plus(monolithWFtmValue),
        wethValue: weth_value.plus(monolithWFtmValue),
        ohmdaiPOL,
        monolithPOL,
        averagePOL,
        gOhmBalance: totalGOhmBalance,
        gOhmValue: totalGohmValue,
        maiBalance: totalMaiBalance,
        maiRfv: maiBalance,
        monolithTotalPoolMv,
        monolithMaiValue,
        monolithMaiBalance,
        monolithExodValue,
        monolithExodBalance,
        monolithWsExodValue,
        monolithWsExodBalance,
        monolithWFtmValue,
        monolithWFtmBalance,
        monolithGOhmValue,
        monolithGOhmBalance,
        index,
    }
}

function getNextOHMRebase(transaction: Transaction): BigDecimal{
    let next_distribution = BigDecimal.fromString("0")

    let staking_contract_v2 = OlympusStakingV2.bind(Address.fromString(STAKING_CONTRACT_V2))
    let distribution_v2 = toDecimal(staking_contract_v2.epoch().value3,9)
    log.debug("next_distribution v2 {}", [distribution_v2.toString()])
    next_distribution = next_distribution.plus(distribution_v2)

    log.debug("next_distribution total {}", [next_distribution.toString()])

    return next_distribution
}

function getAPY_Rebase(sOHM: BigDecimal, distributedOHM: BigDecimal): BigDecimal[]{
    let nextEpochRebase = distributedOHM.div(sOHM).times(BigDecimal.fromString("100"));

    let nextEpochRebase_number = Number.parseFloat(nextEpochRebase.toString())
    let currentAPY = Math.pow(((nextEpochRebase_number/100)+1), (365*3)-1)*100

    let currentAPYdecimal = BigDecimal.fromString(currentAPY.toString())

    log.debug("next_rebase {}", [nextEpochRebase.toString()])
    log.debug("current_apy total {}", [currentAPYdecimal.toString()])

    return [currentAPYdecimal, nextEpochRebase]
}

function getRunway(sOHM: BigDecimal, rfv: BigDecimal, rebase: BigDecimal): BigDecimal[]{
    let runway2dot5k = BigDecimal.fromString("0")
    let runway5k = BigDecimal.fromString("0")
    let runway7dot5k = BigDecimal.fromString("0")
    let runway10k = BigDecimal.fromString("0")
    let runway20k = BigDecimal.fromString("0")
    let runway50k = BigDecimal.fromString("0")
    let runway70k = BigDecimal.fromString("0")
    let runway100k = BigDecimal.fromString("0")
    let runwayCurrent = BigDecimal.fromString("0")

    if(sOHM.gt(BigDecimal.fromString("0")) && rfv.gt(BigDecimal.fromString("0")) &&  rebase.gt(BigDecimal.fromString("0"))){
        let treasury_runway = Number.parseFloat(rfv.div(sOHM).toString())

        let runway2dot5k_num = (Math.log(treasury_runway) / Math.log(1+0.0029438))/3;
        let runway5k_num = (Math.log(treasury_runway) / Math.log(1+0.003579))/3;
        let runway7dot5k_num = (Math.log(treasury_runway) / Math.log(1+0.0039507))/3;
        let runway10k_num = (Math.log(treasury_runway) / Math.log(1+0.00421449))/3;
        let runway20k_num = (Math.log(treasury_runway) / Math.log(1+0.00485037))/3;
        let runway50k_num = (Math.log(treasury_runway) / Math.log(1+0.00569158))/3;
        let runway70k_num = (Math.log(treasury_runway) / Math.log(1+0.00600065))/3;
        let runway100k_num = (Math.log(treasury_runway) / Math.log(1+0.00632839))/3;
        let nextEpochRebase_number = Number.parseFloat(rebase.toString())/100
        let runwayCurrent_num = (Math.log(treasury_runway) / Math.log(1+nextEpochRebase_number))/3;

        runway2dot5k = BigDecimal.fromString(runway2dot5k_num.toString())
        runway5k = BigDecimal.fromString(runway5k_num.toString())
        runway7dot5k = BigDecimal.fromString(runway7dot5k_num.toString())
        runway10k = BigDecimal.fromString(runway10k_num.toString())
        runway20k = BigDecimal.fromString(runway20k_num.toString())
        runway50k = BigDecimal.fromString(runway50k_num.toString())
        runway70k = BigDecimal.fromString(runway70k_num.toString())
        runway100k = BigDecimal.fromString(runway100k_num.toString())
        runwayCurrent = BigDecimal.fromString(runwayCurrent_num.toString())
    }

    return [runway2dot5k, runway5k, runway7dot5k, runway10k, runway20k, runway50k, runway70k, runway100k, runwayCurrent]
}


export function updateProtocolMetrics(transaction: Transaction): void{
    let pm = loadOrCreateProtocolMetric(transaction.timestamp);

    //Total Supply
    pm.totalSupply = getTotalSupply()

    //Circ Supply
    pm.ohmCirculatingSupply = getCriculatingSupply(transaction, pm.totalSupply)

    //sOhm Supply
    pm.sOhmCirculatingSupply = getSohmSupply(transaction)

    //OHM Price
    pm.ohmPrice = getOHMUSDRate()

    //OHM Market Cap
    pm.marketCap = pm.ohmCirculatingSupply.times(pm.ohmPrice)

    //Total Value Locked
    pm.totalValueLocked = pm.sOhmCirculatingSupply.times(pm.ohmPrice)

    //Treasury RFV and MV
    let mv_rfv = getMV_RFV(transaction)
    pm.treasuryMarketValue = mv_rfv.mv
    pm.treasuryRiskFreeValue = mv_rfv.rfv
    pm.treasuryDaiRiskFreeValue = mv_rfv.DaiRfv
    pm.treasuryDaiMarketValue = mv_rfv.DaiMv
    pm.treasuryWETHRiskFreeValue = mv_rfv.wethRfv
    pm.treasuryWETHMarketValue = mv_rfv.wethValue
    pm.treasuryOhmDaiPOL = mv_rfv.ohmdaiPOL
    pm.treasuryMonolithPOL = mv_rfv.monolithPOL
    pm.treasuryAveragePOL = mv_rfv.averagePOL
    pm.treasuryGOhmBalance = mv_rfv.gOhmBalance
    pm.treasuryGOhmMarketValue = mv_rfv.gOhmValue
    pm.treasuryMaiBalance = mv_rfv.maiBalance
    pm.treasuryMaiRiskFreeValue = mv_rfv.maiRfv
    pm.treasuryMonolithTotalPoolValue = mv_rfv.monolithTotalPoolMv
    pm.treasuryMonolithMaiValue = mv_rfv.monolithMaiValue
    pm.treasuryMonolithMaiBalance = mv_rfv.monolithMaiBalance
    pm.treasuryMonolithExodValue = mv_rfv.monolithExodValue
    pm.treasuryMonolithExodBalance = mv_rfv.monolithExodBalance
    pm.treasuryMonolithWsExodValue = mv_rfv.monolithWsExodValue
    pm.treasuryMonolithWsExodBalance = mv_rfv.monolithWsExodBalance
    pm.treasuryMonolithWFtmValue = mv_rfv.monolithWFtmValue
    pm.treasuryMonolithWFtmBalance = mv_rfv.monolithWFtmBalance
    pm.treasuryMonolithGOhmValue = mv_rfv.monolithGOhmValue
    pm.treasuryMonolithGOhmBalance = mv_rfv.monolithGOhmBalance

    // Rebase rewards, APY, rebase
    pm.nextDistributedOhm = getNextOHMRebase(transaction)
    let apy_rebase = getAPY_Rebase(pm.sOhmCirculatingSupply, pm.nextDistributedOhm)
    pm.currentAPY = apy_rebase[0]
    pm.nextEpochRebase = apy_rebase[1]

    //Runway
    let runways = getRunway(pm.sOhmCirculatingSupply, pm.treasuryRiskFreeValue, pm.nextEpochRebase)
    pm.runway2dot5k = runways[0]
    pm.runway5k = runways[1]
    pm.runway7dot5k = runways[2]
    pm.runway10k = runways[3]
    pm.runway20k = runways[4]
    pm.runway50k = runways[5]
    pm.runway70k = runways[6]
    pm.runway100k = runways[7]
    pm.runwayCurrent = runways[8]

    //Holders
    pm.holders = getHolderAux().value

    pm.index = mv_rfv.index

    pm.save()

    updateBondDiscounts(transaction)
}
