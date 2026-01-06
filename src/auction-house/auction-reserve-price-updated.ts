import { ponder } from "ponder:registry";
import type { IndexingFunctionArgs } from "ponder:registry";

import { normalizeAddress } from "./helpers";
import { updateActiveAuctions } from "./shared";

ponder.on(
  "AuctionHouse:AuctionReservePriceUpdated",
  async ({
    event,
    context,
  }: IndexingFunctionArgs<"AuctionHouse:AuctionReservePriceUpdated">) => {
    const auctionContractAddress = normalizeAddress(event.log.address);
    await updateActiveAuctions(context, auctionContractAddress, event.block.timestamp, {
      reservePrice: event.args.reservePrice.toString(),
    });
  },
);
