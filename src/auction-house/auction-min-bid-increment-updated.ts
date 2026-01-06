import { ponder } from "ponder:registry";
import type { IndexingFunctionArgs } from "ponder:registry";

import { normalizeAddress } from "./helpers";
import { updateActiveAuctions } from "./shared";

ponder.on(
  "AuctionHouse:AuctionMinBidIncrementPercentageUpdated",
  async ({
    event,
    context,
  }: IndexingFunctionArgs<"AuctionHouse:AuctionMinBidIncrementPercentageUpdated">) => {
    const auctionContractAddress = normalizeAddress(event.log.address);
    await updateActiveAuctions(context, auctionContractAddress, event.block.timestamp, {
      minBidIncrementPercentage: event.args.minBidIncrementPercentage.toString(),
    });
  },
);
