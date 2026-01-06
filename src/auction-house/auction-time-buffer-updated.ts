import { ponder } from "ponder:registry";
import type { IndexingFunctionArgs } from "ponder:registry";

import { normalizeAddress } from "./helpers";
import { updateActiveAuctions } from "./shared";

ponder.on(
  "AuctionHouse:AuctionTimeBufferUpdated",
  async ({
    event,
    context,
  }: IndexingFunctionArgs<"AuctionHouse:AuctionTimeBufferUpdated">) => {
    const auctionContractAddress = normalizeAddress(event.log.address);
    await updateActiveAuctions(context, auctionContractAddress, event.block.timestamp, {
      timeBuffer: event.args.timeBuffer.toString(),
    });
  },
);
