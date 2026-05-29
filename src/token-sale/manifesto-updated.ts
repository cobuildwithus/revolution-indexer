import { ponder } from "ponder:registry";
import type { IndexingFunctionArgs } from "ponder:registry";
import { auctions } from "ponder:schema";

import {
  generateSaleUniqueId,
  getSaleTokenContract,
  normalizeAddress,
  toDateFromSeconds,
} from "./helpers";

ponder.on(
  "TokenSale:ManifestoUpdated",
  async ({ event, context }: IndexingFunctionArgs<"TokenSale:ManifestoUpdated">) => {
    const chainId = context.chain.id;
    const saleContractAddress = normalizeAddress(event.log.address);
    const tokenId = event.args.tokenId.toString();

    const tokenContract = await getSaleTokenContract(
      context,
      saleContractAddress as `0x${string}`,
    );

    const auctionUniqueId = generateSaleUniqueId(
      chainId,
      tokenId,
      tokenContract,
      saleContractAddress,
    );

    await context.db.update(auctions, { id: auctionUniqueId }).set({
      updatedAt: toDateFromSeconds(event.block.timestamp),
      acceptanceManifestoSpeech: event.args.speech,
    });
  },
);
