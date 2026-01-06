import { eq } from "ponder";
import { ponder } from "ponder:registry";
import { auctionBids, auctions } from "ponder:schema";

import {
  buildAuctionDetails,
  generateAuctionUniqueId,
  getAuctionSettings,
  getAuctionTokenContract,
  getAuctionTokenName,
  normalizeAddress,
  parseDetailsEndTime,
  toDateFromSeconds,
} from "./helpers";

// Index Revolution auction house events into Postgres tables that mirror the
// legacy Prisma schema (auctions / auctionBids).
const updateActiveAuctions = async (
  context: { db: any; chain: { id: number } },
  auctionContractAddress: string,
  eventTimestamp: bigint,
  update: Record<string, unknown>,
) => {
  // Ponder's update API is keyed by primary key, so we select then update in-memory.
  const rows = await context.db.sql
    .select()
    .from(auctions)
    .where(eq(auctions.auctionContractAddress, auctionContractAddress));

  const cutoff = toDateFromSeconds(eventTimestamp);
  const activeRows = rows.filter((row: { details: unknown; chainId: number }) => {
    if (row.chainId !== context.chain.id) return false;
    const endTime = parseDetailsEndTime(row.details);
    return endTime ? endTime >= cutoff : false;
  });

  await Promise.all(
    activeRows.map((row: { id: string }) =>
      context.db.update(auctions, { id: row.id }).set(update),
    ),
  );
};

// AuctionCreated → upsert auction row with contract settings + metadata name.
const handleAuctionCreated = async ({ event, context }: any) => {
  const chainId = context.chain.id;
  const auctionContractAddress = normalizeAddress(event.address);
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

  const { timeBuffer, reservePrice, minBidIncrementPercentage, creatorRateBps, entropyRateBps } =
    await getAuctionSettings(context, auctionContractAddress as `0x${string}`);

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
};

// AuctionBid → upsert a bid row (unique per tx+log index).
const handleAuctionBid = async ({ event, context }: any) => {
  const chainId = context.chain.id;
  const auctionContractAddress = normalizeAddress(event.address);
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

  const txHash = event.transaction.hash.toLowerCase();
  const logIndex = event.log.logIndex;
  const uniqueId = `${auctionUniqueId}-${txHash}-${logIndex}`;

  const doc = {
    id: uniqueId,
    uniqueId,
    bidAmount: event.args.value.toString(),
    transactionHash: txHash,
    bidder: normalizeAddress(event.args.bidder),
    sender: normalizeAddress(event.args.sender),
    bidCreatedAt: toDateFromSeconds(event.block.timestamp),
    auctionUniqueId,
    chainId,
    auctionContractAddress,
  };

  await context.db.insert(auctionBids).values(doc).onConflictDoUpdate({
    bidAmount: doc.bidAmount,
    bidCreatedAt: doc.bidCreatedAt,
    bidder: doc.bidder,
  });
};

// AuctionSettled → finalize the auction with winner + payouts.
const handleAuctionSettled = async ({ event, context }: any) => {
  const chainId = context.chain.id;
  const auctionContractAddress = normalizeAddress(event.address);
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

  const pointsPaidToCreators = event.args.pointsPaidToCreators
    ? event.args.pointsPaidToCreators.toString()
    : null;
  const ethPaidToCreators = event.args.ethPaidToCreators
    ? event.args.ethPaidToCreators.toString()
    : null;

  await context.db.update(auctions, { id: auctionUniqueId }).set({
    updatedAt: new Date(),
    pointsPaidToCreators,
    ethPaidToCreators,
    winner: normalizeAddress(event.args.winner),
    winningBid: event.args.amount.toString(),
    settlementTransactionHash: event.transaction.hash.toLowerCase(),
  });
};

// AuctionExtended → update details.endTime.
const handleAuctionExtended = async ({ event, context }: any) => {
  const chainId = context.chain.id;
  const auctionContractAddress = normalizeAddress(event.address);
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

  const existing = await context.db.find(auctions, { id: auctionUniqueId });
  if (!existing) {
    throw new Error(`Auction not found for ${auctionUniqueId}`);
  }

  const updatedDetails = {
    ...(existing.details || {}),
    endTime: toDateFromSeconds(event.args.endTime).toISOString(),
  };

  await context.db.update(auctions, { id: auctionUniqueId }).set({
    updatedAt: new Date(),
    details: updatedDetails,
  });
};

// ManifestoUpdated → store the acceptance speech on the auction.
const handleManifestoUpdated = async ({ event, context }: any) => {
  const chainId = context.chain.id;
  const auctionContractAddress = normalizeAddress(event.address);
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
};

// Global auction config updates are applied to all active (unsettled) auctions.
const handleAuctionTimeBufferUpdated = async ({ event, context }: any) => {
  const auctionContractAddress = normalizeAddress(event.address);
  await updateActiveAuctions(context, auctionContractAddress, event.block.timestamp, {
    timeBuffer: event.args.timeBuffer.toString(),
  });
};

const handleAuctionReservePriceUpdated = async ({ event, context }: any) => {
  const auctionContractAddress = normalizeAddress(event.address);
  await updateActiveAuctions(context, auctionContractAddress, event.block.timestamp, {
    reservePrice: event.args.reservePrice.toString(),
  });
};

const handleAuctionMinBidIncrementUpdated = async ({ event, context }: any) => {
  const auctionContractAddress = normalizeAddress(event.address);
  await updateActiveAuctions(context, auctionContractAddress, event.block.timestamp, {
    minBidIncrementPercentage: event.args.minBidIncrementPercentage.toString(),
  });
};

const handleCreatorRateBpsUpdated = async ({ event, context }: any) => {
  const auctionContractAddress = normalizeAddress(event.address);
  await updateActiveAuctions(context, auctionContractAddress, event.block.timestamp, {
    creatorRateBps: Number(event.args.rateBps),
  });
};

const handleEntropyRateBpsUpdated = async ({ event, context }: any) => {
  const auctionContractAddress = normalizeAddress(event.address);
  await updateActiveAuctions(context, auctionContractAddress, event.block.timestamp, {
    entropyRateBps: Number(event.args.rateBps),
  });
};

ponder.on("AuctionHouse:AuctionCreated", handleAuctionCreated);
ponder.on("AuctionHouse:AuctionBid", handleAuctionBid);
ponder.on("AuctionHouse:AuctionSettled", handleAuctionSettled);
ponder.on("AuctionHouse:AuctionExtended", handleAuctionExtended);
ponder.on("AuctionHouse:AuctionTimeBufferUpdated", handleAuctionTimeBufferUpdated);
ponder.on("AuctionHouse:AuctionReservePriceUpdated", handleAuctionReservePriceUpdated);
ponder.on(
  "AuctionHouse:AuctionMinBidIncrementPercentageUpdated",
  handleAuctionMinBidIncrementUpdated,
);
ponder.on("AuctionHouse:CreatorRateBpsUpdated", handleCreatorRateBpsUpdated);
ponder.on("AuctionHouse:EntropyRateBpsUpdated", handleEntropyRateBpsUpdated);
ponder.on("AuctionHouse:ManifestoUpdated", handleManifestoUpdated);
