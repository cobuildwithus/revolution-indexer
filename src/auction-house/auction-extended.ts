import { ponder } from "ponder:registry";
import type { IndexingFunctionArgs } from "ponder:registry";
import { auctions } from "ponder:schema";

import {
  generateAuctionUniqueId,
  getAuctionTokenContract,
  normalizeAddress,
  toDateFromSeconds,
} from "./helpers";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

ponder.on(
  "AuctionHouse:AuctionExtended",
  async ({ event, context }: IndexingFunctionArgs<"AuctionHouse:AuctionExtended">) => {
    const chainId = context.chain.id;
    const auctionContractAddress = normalizeAddress(event.log.address);
    const tokenId = event.args.tokenId.toString();

    const tokenContract = await getAuctionTokenContract(
      context,
      auctionContractAddress as `0x${string}`,
    );

    const auctionUniqueId = generateAuctionUniqueId(
      chainId,
      tokenId,
      tokenContract,
      auctionContractAddress,
    );

    const existing = await context.db.find(auctions, { id: auctionUniqueId });
    if (!existing) {
      throw new Error(`Auction not found for ${auctionUniqueId}`);
    }

    const existingDetails = isRecord(existing.details) ? existing.details : {};
    const updatedDetails = {
      ...existingDetails,
      endTime: toDateFromSeconds(event.args.endTime).toISOString(),
    };

    await context.db.update(auctions, { id: auctionUniqueId }).set({
      updatedAt: new Date(),
      details: updatedDetails,
    });
  },
);
