import { createConfig } from "ponder";
import { fallback, http } from "viem";
import { base } from "viem/chains";

import { auctionHouseAbi } from "./abis/AuctionHouseAbi";
import { CultureIndexAbi } from "./abis/CultureIndexAbi";
import { RevolutionDaoLogicV1Abi } from "./abis/RevolutionDaoLogicV1Abi";
import { RevolutionTokenSaleAbi } from "./abis/RevolutionTokenSaleAbi";
import {
  AUCTION_HOUSE_ADDRESSES,
  CULTURE_INDEX_ADDRESSES,
  REVOLUTION_DAO_ADDRESSES,
  TOKEN_SALE_ADDRESSES,
  TOKEN_SALE_START_BLOCK,
  VRBS_START_BLOCK,
} from "./src/config/contracts";

const DWELLIR_API_KEY = process.env.DWELLIR_API_KEY;
const ALCHEMY_API_KEY_BASE = process.env.ALCHEMY_API_KEY_BASE;
if (!DWELLIR_API_KEY) {
  throw new Error("Missing required env var: DWELLIR_API_KEY");
}

const getBaseRpcTransport = () => {
  // retryCount: 0 so that once Dwellir's monthly quota is exhausted and it
  // starts erroring, each request fails over to Alchemy immediately instead
  // of burning 3 retries with backoff against a dead endpoint. Traffic
  // returns to Dwellir automatically when its quota resets.
  const dwellirTransport = http(
    `https://api-base-mainnet-archive.n.dwellir.com/${DWELLIR_API_KEY}`,
    { retryCount: 0 },
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
      // Default is 1000ms, which adds ~86K eth_getBlockByNumber/day of
      // "latest" polls on top of the per-block fetches realtime sync always
      // does (~43K/day on Base). Any interval >= block time converges to one
      // fetch per block; 10s cuts total RPC volume ~40% while keeping reorg
      // handling snappy. Events land up to ~10s late, which is fine here.
      pollingInterval: 10_000,
    },
  },
  contracts: {
    AuctionHouse: {
      chain: "base",
      abi: auctionHouseAbi,
      address: AUCTION_HOUSE_ADDRESSES,
      startBlock: VRBS_START_BLOCK,
    },
    TokenSale: {
      chain: "base",
      abi: RevolutionTokenSaleAbi,
      address: TOKEN_SALE_ADDRESSES,
      startBlock: TOKEN_SALE_START_BLOCK,
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
