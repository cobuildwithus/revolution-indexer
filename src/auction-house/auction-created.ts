import { ponder } from "ponder:registry";
import type { IndexingFunctionArgs } from "ponder:registry";
import { auctions } from "ponder:schema";

import {
  buildAuctionDetails,
  generateAuctionUniqueId,
  getAuctionSettings,
  getAuctionTokenContract,
  getAuctionTokenName,
  normalizeAddress,
  toDateFromSeconds,
} from "./helpers";

ponder.on(
  "AuctionHouse:AuctionCreated",
  async ({ event, context }: IndexingFunctionArgs<"AuctionHouse:AuctionCreated">) => {
    const chainId = context.chain.id;
    const auctionContractAddress = normalizeAddress(event.log.address);
    const tokenId = event.args.tokenId.toString();

    const tokenContract = await getAuctionTokenContract(
      context,
      auctionContractAddress as `0x${string}`,
    );

    const uniqueId = generateAuctionUniqueId(
      chainId,
      tokenId,
      tokenContract,
      auctionContractAddress,
    );

    const name = (await getAuctionTokenName({ tokenId, tokenContract })) || tokenId;

    const {
      timeBuffer,
      reservePrice,
      minBidIncrementPercentage,
      creatorRateBps,
      entropyRateBps,
    } = await getAuctionSettings(context, auctionContractAddress as `0x${string}`);

    const createdAt = toDateFromSeconds(event.block.timestamp);
    const details = buildAuctionDetails(
      toDateFromSeconds(event.args.startTime),
      toDateFromSeconds(event.args.endTime),
    );

    const doc = {
      id: uniqueId,
      uniqueId,
      chainId,
      name,
      winner: null,
      winningBid: null,
      auctionContractAddress,
      nftContractAddress: tokenContract,
      pointsPaidToCreators: null,
      ethPaidToCreators: null,
      nftTokenId: tokenId,
      type: "revolution_v1",
      details,
      creatorRateBps,
      entropyRateBps,
      acceptanceManifestoSpeech: null,
      reservePrice,
      minBidIncrementPercentage,
      timeBuffer,
      settlementTransactionHash: null,
      createdAt,
      updatedAt: createdAt,
    };

    const { id: _id, ...updateDoc } = doc;
    await context.db.insert(auctions).values(doc).onConflictDoUpdate(updateDoc);
  },
);
