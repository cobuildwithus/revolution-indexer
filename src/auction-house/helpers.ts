import type { Context } from "ponder:registry";
import { auctionHouseAbi } from "../../abis/AuctionHouseAbi";

// Local in-process caches to reduce RPC/HTTP calls during backfills.
const tokenContractCache = new Map<string, `0x${string}`>();
const auctionNameCache = new Map<string, string | null>();

// Alchemy NFT API is used to mirror `getNftMetadata` from the legacy ingestion.
const ALCHEMY_API_KEY_BASE = process.env.ALCHEMY_API_KEY_BASE;
const ALCHEMY_BASE_URL = "https://base-mainnet.g.alchemy.com/nft/v3";

// Prisma stores `Auction.details` as an embedded object. We keep the same shape.
export type AuctionDetails = {
  startTime: string;
  endTime: string;
  sellerAddress: string | null;
  fundsRecipient: string | null;
};

export const normalizeAddress = (address: string) => address.toLowerCase();

export const toDateFromSeconds = (seconds: bigint | number) =>
  new Date(Number(seconds) * 1000);

const numberishToString = (value: bigint | number) => value.toString();

// Store dates as ISO strings so JSON round-trips cleanly.
export const buildAuctionDetails = (
  startTime: Date,
  endTime: Date,
): AuctionDetails => ({
  startTime: startTime.toISOString(),
  endTime: endTime.toISOString(),
  sellerAddress: null,
  fundsRecipient: null,
});

// Best-effort parser for details.endTime to support "update active auctions" logic.
export const parseDetailsEndTime = (details: unknown): Date | null => {
  if (!details || typeof details !== "object") return null;
  const endTime = (details as { endTime?: string }).endTime;
  if (!endTime) return null;
  const parsed = new Date(endTime);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

// Keep the legacy uniqueId format for compatibility with existing app code.
export const generateAuctionUniqueId = (
  chainId: number,
  nftTokenId: string,
  tokenContract: string,
  auctionContract: string,
) => {
  if (!tokenContract || !auctionContract) {
    throw new Error(
      `Missing token contract or auction contract for ${chainId}-${nftTokenId}-${tokenContract}-${auctionContract}`,
    );
  }

  return `ethereum-${chainId}-${tokenContract.toLowerCase()}-${auctionContract.toLowerCase()}-${nftTokenId}`;
};

// Resolve the ERC-721 token for a Revolution auction house (cached).
export const getAuctionTokenContract = async (
  context: Context<"AuctionHouse:AuctionCreated">,
  auctionContract: `0x${string}`,
): Promise<`0x${string}`> => {
  const cacheKey = auctionContract.toLowerCase();
  const cached = tokenContractCache.get(cacheKey);
  if (cached) return cached;

  const token = (await context.client.readContract({
    address: auctionContract,
    abi: auctionHouseAbi,
    functionName: "revolutionToken",
  })) as `0x${string}`;

  const normalized = normalizeAddress(token) as `0x${string}`;
  tokenContractCache.set(cacheKey, normalized);
  return normalized;
};

// Snapshot auction settings at ingest time to mirror legacy behavior.
export const getAuctionSettings = async (
  context: Context<"AuctionHouse:AuctionCreated">,
  auctionContract: `0x${string}`,
) => {
  const [timeBuffer, reservePrice, minBidIncrementPercentage, creatorRateBps, entropyRateBps] =
    await Promise.all([
      context.client.readContract({
        address: auctionContract,
        abi: auctionHouseAbi,
        functionName: "timeBuffer",
      }),
      context.client.readContract({
        address: auctionContract,
        abi: auctionHouseAbi,
        functionName: "reservePrice",
      }),
      context.client.readContract({
        address: auctionContract,
        abi: auctionHouseAbi,
        functionName: "minBidIncrementPercentage",
      }),
      context.client.readContract({
        address: auctionContract,
        abi: auctionHouseAbi,
        functionName: "creatorRateBps",
      }),
      context.client.readContract({
        address: auctionContract,
        abi: auctionHouseAbi,
        functionName: "entropyRateBps",
      }),
    ]);

  return {
    timeBuffer: numberishToString(timeBuffer as bigint | number),
    reservePrice: numberishToString(reservePrice as bigint | number),
    minBidIncrementPercentage: numberishToString(
      minBidIncrementPercentage as bigint | number,
    ),
    creatorRateBps: Number(creatorRateBps),
    entropyRateBps: Number(entropyRateBps),
  };
};

// Fetch NFT metadata name from Alchemy (Base) for `Auction.name` parity.
export const getAuctionTokenName = async (args: {
  tokenId: string;
  tokenContract: `0x${string}`;
}) => {
  const { tokenId, tokenContract } = args;
  const cacheKey = `${tokenContract.toLowerCase()}:${tokenId}`;
  if (auctionNameCache.has(cacheKey)) {
    return auctionNameCache.get(cacheKey);
  }

  if (!ALCHEMY_API_KEY_BASE) {
    auctionNameCache.set(cacheKey, null);
    return null;
  }

  const url = new URL(`${ALCHEMY_BASE_URL}/${ALCHEMY_API_KEY_BASE}/getNFTMetadata`);
  url.searchParams.set("contractAddress", tokenContract);
  url.searchParams.set("tokenId", tokenId);

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      auctionNameCache.set(cacheKey, null);
      return null;
    }
    const data = (await response.json()) as { name?: string | null };
    const name = data?.name || null;
    auctionNameCache.set(cacheKey, name);
    return name;
  } catch {
    auctionNameCache.set(cacheKey, null);
    return null;
  }
};
