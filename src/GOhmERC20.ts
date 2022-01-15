import { Address, ethereum } from "@graphprotocol/graph-ts";
import { GOhmERC20 } from "../generated/GOhmERC20/GOhmERC20";
import { GOHM_ERC20_CONTRACT, TREASURY_ADDRESS_V2 } from "./utils/Constants";
import { hourFromTimestamp } from "./utils/Dates";
import { toDecimal } from "./utils/Decimals";
import { loadOrCreateProtocolMetric } from "./utils/ProtocolMetrics";

export function handleBlock(block: ethereum.Block): void {
    const pm = loadOrCreateProtocolMetric(block.timestamp)
    const hourTimestamp = hourFromTimestamp(block.timestamp)
    const pmHourTimestamp = hourFromTimestamp(pm.timestamp)

    if (hourTimestamp !== pmHourTimestamp) {
        const gOhmContract = GOhmERC20.bind(Address.fromString(GOHM_ERC20_CONTRACT))
        const gOhmBalance = gOhmContract.balanceOf(Address.fromString(TREASURY_ADDRESS_V2))
        pm.treasuryGOhmBalance = toDecimal(gOhmBalance, 18)
        pm.save()
    }
}