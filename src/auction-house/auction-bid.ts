import { ponder } from "ponder:registry";
import type { IndexingFunctionArgs } from "ponder:registry";
import { auctionBids } from "ponder:schema";

import {
  generateAuctionUniqueId,
  getAuctionTokenContract,
  normalizeAddress,
  toDateFromSeconds,
} from "./helpers";

ponder.on(
  "AuctionHouse:AuctionBid",
  async ({ event, context }: IndexingFunctionArgs<"AuctionHouse:AuctionBid">) => {
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

    const txHash = event.transaction.hash.toLowerCase();
    const logIndex = event.log.logIndex;
    const uniqueId = `${auctionUniqueId}-${txHash}-${logIndex}`;

    const doc = {
      id: uniqueId,
      uniqueId,
      bidAmount: event.args.value.toString(),
      transactionHash: txHash,
      bidder: normalizeAddress(event.args.bidder),
      sender: normalizeAddress(event.args.sender),
      bidCreatedAt: toDateFromSeconds(event.block.timestamp),
      auctionUniqueId,
      chainId,
      auctionContractAddress,
    };

    await context.db.insert(auctionBids).values(doc).onConflictDoUpdate({
      bidAmount: doc.bidAmount,
      bidCreatedAt: doc.bidCreatedAt,
      bidder: doc.bidder,
    });
  },
);
