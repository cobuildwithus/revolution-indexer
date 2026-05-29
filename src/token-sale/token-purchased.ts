import { ponder } from "ponder:registry";
import type { IndexingFunctionArgs } from "ponder:registry";
import { auctions } from "ponder:schema";

import {
  generateSaleUniqueId,
  getSaleSettings,
  getSaleTokenContract,
  getTokenSaleSpec,
  normalizeAddress,
  nullableAddress,
  toDateFromSeconds,
} from "./helpers";

ponder.on(
  "TokenSale:TokenPurchased",
  async ({ event, context }: IndexingFunctionArgs<"TokenSale:TokenPurchased">) => {
    const chainId = context.chain.id;
    const saleContractAddress = normalizeAddress(event.log.address);
    const tokenId = event.args.tokenId.toString();
    const pieceId = event.args.pieceId.toString();
    const purchaseTime = toDateFromSeconds(event.block.timestamp);
    const txHash = event.transaction.hash.toLowerCase();
    const typedSaleContractAddress = saleContractAddress as `0x${string}`;

    const [tokenContract, saleSettings] = await Promise.all([
      getSaleTokenContract(context, typedSaleContractAddress),
      getSaleSettings(context, typedSaleContractAddress),
    ]);

    const uniqueId = generateSaleUniqueId(
      chainId,
      tokenId,
      tokenContract,
      saleContractAddress,
    );

    const saleSpec = getTokenSaleSpec(saleContractAddress);
    const cultureIndexAddress = saleSpec?.cultureIndexAddress
      ? normalizeAddress(saleSpec.cultureIndexAddress)
      : null;
    const legacyAuctionHouseAddress = saleSpec?.legacyAuctionHouseAddress
      ? normalizeAddress(saleSpec.legacyAuctionHouseAddress)
      : null;

    const submissionSlug = cultureIndexAddress
      ? `${chainId}:${cultureIndexAddress}:${pieceId}`
      : null;

    const details = {
      saleType: "vrgda",
      pieceId,
      buyer: normalizeAddress(event.args.buyer),
      recipient: normalizeAddress(event.args.recipient),
      referral: nullableAddress(event.args.referral),
      saleContractAddress,
      legacyAuctionHouseAddress,
      cultureIndexAddress,
      submissionSlug,
      startTime: purchaseTime.toISOString(),
      endTime: purchaseTime.toISOString(),
      sellerAddress: null,
      fundsRecipient: null,
      purchaseTime: purchaseTime.toISOString(),
    };

    const doc = {
      id: uniqueId,
      uniqueId,
      chainId,
      name: tokenId,
      winner: normalizeAddress(event.args.recipient),
      winningBid: event.args.price.toString(),
      auctionContractAddress: saleContractAddress,
      nftContractAddress: tokenContract,
      pointsPaidToCreators: event.args.pointsPaidToCreators.toString(),
      ethPaidToCreators: event.args.ethPaidToCreators.toString(),
      nftTokenId: tokenId,
      type: "revolution_v1",
      details,
      creatorRateBps: saleSettings.creatorRateBps,
      entropyRateBps: saleSettings.entropyRateBps,
      acceptanceManifestoSpeech: null,
      reservePrice: saleSettings.reservePrice,
      minBidIncrementPercentage: null,
      timeBuffer: saleSettings.timeBuffer,
      settlementTransactionHash: txHash,
      createdAt: purchaseTime,
      updatedAt: purchaseTime,
    };

    const { id: _id, acceptanceManifestoSpeech: _speech, ...updateDoc } = doc;
    await context.db.insert(auctions).values(doc).onConflictDoUpdate(updateDoc);
  },
);
