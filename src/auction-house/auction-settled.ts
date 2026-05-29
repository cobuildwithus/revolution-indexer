import { ponder } from "ponder:registry";
import type { IndexingFunctionArgs } from "ponder:registry";
import { auctions } from "ponder:schema";

import {
  generateAuctionUniqueId,
  getAuctionTokenContract,
  normalizeAddress,
  toDateFromSeconds,
} from "./helpers";

ponder.on(
  "AuctionHouse:AuctionSettled",
  async ({ event, context }: IndexingFunctionArgs<"AuctionHouse:AuctionSettled">) => {
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

    const pointsPaidToCreators = event.args.pointsPaidToCreators.toString();
    const ethPaidToCreators = event.args.ethPaidToCreators.toString();

    await context.db.update(auctions, { id: auctionUniqueId }).set({
      updatedAt: toDateFromSeconds(event.block.timestamp),
      pointsPaidToCreators,
      ethPaidToCreators,
      winner: normalizeAddress(event.args.winner),
      recipient: normalizeAddress(event.args.winner),
      winningBid: event.args.amount.toString(),
      settlementTransactionHash: event.transaction.hash.toLowerCase(),
    });
  },
);
