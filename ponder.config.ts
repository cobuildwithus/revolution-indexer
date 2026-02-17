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

const ALCHEMY_API_KEY_BASE = process.env.ALCHEMY_API_KEY_BASE;
const DWELLIR_API_KEY = process.env.DWELLIR_API_KEY;

const defined = <T>(value: T | undefined | null): value is T => !!value;

type HttpTransport = ReturnType<typeof http>;

function assertAtLeastTwo<T>(items: T[]): asserts items is [T, T, ...T[]] {
  if (items.length < 2) {
    throw new Error("Expected at least two transports.");
  }
}

const getBaseRpcTransport = () => {
  const urls = [
    DWELLIR_API_KEY && `https://api-base-mainnet.n.dwellir.com/${DWELLIR_API_KEY}`,
    ALCHEMY_API_KEY_BASE &&
      `https://base-mainnet.g.alchemy.com/v2/${ALCHEMY_API_KEY_BASE}`,
  ].filter(defined);

  if (urls.length === 0) {
    throw new Error(
      "Missing RPC key. Set DWELLIR_API_KEY (preferred) or ALCHEMY_API_KEY_BASE (fallback).",
    );
  }

  const transports = urls.map((url) => http(url));
  if (transports.length === 1) {
    return transports[0];
  }

  assertAtLeastTwo(transports);
  return fallback(
    transports as readonly [HttpTransport, HttpTransport, ...HttpTransport[]],
  );
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
