import type { Context } from "ponder:registry";

import { RevolutionTokenSaleAbi } from "../../abis/RevolutionTokenSaleAbi";
import { TOKEN_SALE_CONTRACTS } from "../config/contracts";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const tokenContractCache = new Map<string, `0x${string}`>();

type TokenSaleReadContext = Pick<Context<"TokenSale:TokenPurchased">, "client">;

export const normalizeAddress = (address: string) => address.toLowerCase();

const numberishToString = (value: bigint | number) => value.toString();

export const nullableAddress = (address: string) => {
  const normalized = normalizeAddress(address);
  return normalized === ZERO_ADDRESS ? null : normalized;
};

export const toDateFromSeconds = (seconds: bigint | number) =>
  new Date(Number(seconds) * 1000);

export const generateSaleUniqueId = (
  chainId: number,
  nftTokenId: string,
  tokenContract: string,
  saleContract: string,
) =>
  `ethereum-${chainId}-${tokenContract.toLowerCase()}-${saleContract.toLowerCase()}-${nftTokenId}`;

export const getTokenSaleSpec = (saleContract: string) => {
  const normalized = normalizeAddress(saleContract);
  return TOKEN_SALE_CONTRACTS.find(
    (contract) => normalizeAddress(contract.address) === normalized,
  );
};

export const getSaleTokenContract = async (
  context: TokenSaleReadContext,
  saleContract: `0x${string}`,
): Promise<`0x${string}`> => {
  const cacheKey = saleContract.toLowerCase();
  const cached = tokenContractCache.get(cacheKey);
  if (cached) return cached;

  const token = (await context.client.readContract({
    address: saleContract,
    abi: RevolutionTokenSaleAbi,
    functionName: "revolutionToken",
  })) as `0x${string}`;

  const normalized = normalizeAddress(token) as `0x${string}`;
  tokenContractCache.set(cacheKey, normalized);
  return normalized;
};

export const getSaleSettings = async (
  context: TokenSaleReadContext,
  saleContract: `0x${string}`,
) => {
  const [creatorRateBps, entropyRateBps, minPriceWei, priceUpdateInterval] =
    await Promise.all([
      context.client.readContract({
        address: saleContract,
        abi: RevolutionTokenSaleAbi,
        functionName: "creatorRateBps",
      }),
      context.client.readContract({
        address: saleContract,
        abi: RevolutionTokenSaleAbi,
        functionName: "entropyRateBps",
      }),
      context.client.readContract({
        address: saleContract,
        abi: RevolutionTokenSaleAbi,
        functionName: "minPriceWei",
      }),
      context.client.readContract({
        address: saleContract,
        abi: RevolutionTokenSaleAbi,
        functionName: "priceUpdateInterval",
      }),
    ]);

  return {
    creatorRateBps: Number(creatorRateBps),
    entropyRateBps: Number(entropyRateBps),
    reservePrice: numberishToString(minPriceWei as bigint | number),
    timeBuffer: numberishToString(priceUpdateInterval as bigint | number),
  };
};
