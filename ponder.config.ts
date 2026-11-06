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
  // retryCount: 0 so a failed request moves to the next provider at once.
  const transports = [
    http(`https://api-base-mainnet-archive.n.dwellir.com/${DWELLIR_API_KEY}`, {
      retryCount: 0,
    }),
    // Free and keyless, but not an archive node: it serves the recent blocks
    // and logs that catch-up needs and rejects old ranges.
    http("https://base-rpc.publicnode.com", { retryCount: 0 }),
  ];

  // Last resort, for old blocks while Dwellir is down.
  if (ALCHEMY_API_KEY_BASE) {
    transports.push(
      http(`https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY_BASE}`),
    );
  }

  return fallback(transports);
};

export default createConfig({
  database: { kind: "postgres" },
  chains: {
    base: {
      id: base.id,
      rpc: getBaseRpcTransport(),
      // Base makes 5 blocks a second. Realtime sync fetches every block but at
      // most 50 per poll, so this interval sets the RPC bill: 5 minutes is about
      // 14K block fetches a day, inside Dwellir's free 100K. That can't keep up
      // with the chain, so scripts/start-with-catch-up.mjs restarts Ponder every
      // hour to jump back to the head with ranged eth_getLogs.
      pollingInterval: 300_000,
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
