import { createConfig } from "ponder";
import { fallback, http } from "viem";
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
const ALCHEMY_API_KEY_BASE = process.env.ALCHEMY_API_KEY_BASE;
if (!DWELLIR_API_KEY) {
  throw new Error("Missing required env var: DWELLIR_API_KEY");
}

const getBaseRpcTransport = () => {
  const dwellirTransport = http(
    `https://api-base-mainnet-archive.n.dwellir.com/${DWELLIR_API_KEY}`,
  );

  if (!ALCHEMY_API_KEY_BASE) {
    return dwellirTransport;
  }

  return fallback([
    dwellirTransport,
    http(`https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY_BASE}`),
  ]);
};

export default createConfig({
  database: { kind: "postgres" },
  chains: {
    base: {
      id: base.id,
      rpc: getBaseRpcTransport(),
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
