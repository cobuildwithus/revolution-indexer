import { createConfig } from "ponder";
import { base } from "viem/chains";

import { auctionHouseAbi } from "./abis/AuctionHouseAbi";
import { CultureIndexAbi } from "./abis/CultureIndexAbi";
import { RevolutionDaoLogicV1Abi } from "./abis/RevolutionDaoLogicV1Abi";
import {
  AUCTION_HOUSE_ADDRESSES,
  CULTURE_INDEX_ADDRESSES,
  REVOLUTION_DAO_ADDRESSES,
  VRBS_START_BLOCK,
} from "./src/config/contracts";

const DWELLIR_API_KEY = process.env.DWELLIR_API_KEY;
if (!DWELLIR_API_KEY) {
  throw new Error("Missing required env var: DWELLIR_API_KEY");
}

export default createConfig({
  database: { kind: "postgres" },
  chains: {
    base: {
      id: base.id,
      rpc: `https://api-base-mainnet.n.dwellir.com/${DWELLIR_API_KEY}`,
    },
  },
  contracts: {
    AuctionHouse: {
      chain: "base",
      abi: auctionHouseAbi,
      address: AUCTION_HOUSE_ADDRESSES,
      startBlock: VRBS_START_BLOCK,
    },
    CultureIndex: {
      chain: "base",
      abi: CultureIndexAbi,
      address: CULTURE_INDEX_ADDRESSES,
      startBlock: VRBS_START_BLOCK,
    },
    RevolutionDao: {
      chain: "base",
      abi: RevolutionDaoLogicV1Abi,
      address: REVOLUTION_DAO_ADDRESSES,
      startBlock: VRBS_START_BLOCK,
    },
  },
});
