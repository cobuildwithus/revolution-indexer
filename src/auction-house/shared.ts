import { eq } from "ponder";
import type { Context } from "ponder:registry";
import { auctions } from "ponder:schema";

import { parseDetailsEndTime, toDateFromSeconds } from "./helpers";

type AuctionHouseContext = Context<"AuctionHouse:AuctionCreated">;

type AuctionRow = typeof auctions.$inferSelect;

// Indexing uses primary key updates; select active auctions, then update in-memory.
export const updateActiveAuctions = async (
  context: AuctionHouseContext,
  auctionContractAddress: string,
  eventTimestamp: bigint,
  update: Record<string, unknown>,
) => {
  const rows = (await context.db.sql
    .select()
    .from(auctions)
    .where(eq(auctions.auctionContractAddress, auctionContractAddress))) as AuctionRow[];

  const cutoff = toDateFromSeconds(eventTimestamp);
  const activeRows = rows.filter((row) => {
    if (row.chainId !== context.chain.id) return false;
    const endTime = parseDetailsEndTime(row.details);
    return endTime ? endTime >= cutoff : false;
  });

  await Promise.all(
    activeRows.map((row) => context.db.update(auctions, { id: row.id }).set(update)),
  );
};
