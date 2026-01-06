import { ponder } from "ponder:registry";
import type { IndexingFunctionArgs } from "ponder:registry";

import { normalizeAddress } from "./helpers";
import { updateActiveAuctions } from "./shared";

ponder.on(
  "AuctionHouse:CreatorRateBpsUpdated",
  async ({
    event,
    context,
  }: IndexingFunctionArgs<"AuctionHouse:CreatorRateBpsUpdated">) => {
    const auctionContractAddress = normalizeAddress(event.log.address);
    await updateActiveAuctions(context, auctionContractAddress, event.block.timestamp, {
      creatorRateBps: Number(event.args.rateBps),
    });
  },
);
