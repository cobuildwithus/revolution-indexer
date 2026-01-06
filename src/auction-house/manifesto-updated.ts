import { ponder } from "ponder:registry";
import type { IndexingFunctionArgs } from "ponder:registry";
import { auctions } from "ponder:schema";

import {
  generateAuctionUniqueId,
  getAuctionTokenContract,
  normalizeAddress,
} from "./helpers";

ponder.on(
  "AuctionHouse:ManifestoUpdated",
  async ({ event, context }: IndexingFunctionArgs<"AuctionHouse:ManifestoUpdated">) => {
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

    await context.db.update(auctions, { id: auctionUniqueId }).set({
      updatedAt: new Date(),
      acceptanceManifestoSpeech: event.args.speech,
    });
  },
);
