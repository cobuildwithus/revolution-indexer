import { ponder } from "ponder:registry";
import type { IndexingFunctionArgs } from "ponder:registry";

import { normalizeAddress } from "./helpers";
import { updateActiveAuctions } from "./shared";

ponder.on(
  "AuctionHouse:EntropyRateBpsUpdated",
  async ({
    event,
    context,
  }: IndexingFunctionArgs<"AuctionHouse:EntropyRateBpsUpdated">) => {
    const auctionContractAddress = normalizeAddress(event.log.address);
    await updateActiveAuctions(context, auctionContractAddress, event.block.timestamp, {
      entropyRateBps: Number(event.args.rateBps),
    });
  },
);
