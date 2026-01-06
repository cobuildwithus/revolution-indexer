import { ponder } from "ponder:registry";
import type { IndexingFunctionArgs } from "ponder:registry";
import { submissions } from "ponder:schema";

import {
  convertIpfsToHttp,
  generateSubmissionSlug,
  getMediaType,
  isSupportedMediaUrl,
  normalizeAddress,
  toBlockTimestamp,
} from "./helpers";

ponder.on(
  "CultureIndex:PieceCreated",
  async ({ event, context }: IndexingFunctionArgs<"CultureIndex:PieceCreated">) => {
    const { pieceId, sponsor, metadata, creators } = event.args;
    const { name, description, image, text, animationUrl, mediaType } = metadata;

    const mediaUrl = animationUrl || image;
    if (!isSupportedMediaUrl(mediaUrl)) {
      console.warn("Skipping PieceCreated with unsupported media URL", {
        pieceId: pieceId.toString(),
        mediaUrl,
      });
      return;
    }

    const chainId = context.chain.id;
    const contractAddress = normalizeAddress(event.log.address);
    const normalizedPieceId = pieceId.toString();
    const slug = generateSubmissionSlug(chainId, contractAddress, normalizedPieceId);
    const timestamp = toBlockTimestamp(event.block.timestamp);
    const sponsorAddress = normalizeAddress(sponsor);

    const normalizedUrl = convertIpfsToHttp(mediaUrl);
    const resolvedMediaType = getMediaType(Number(mediaType));
    const thumbnailUrl = resolvedMediaType === "image" ? normalizedUrl : null;

    const mediaMetadata = {
      type: resolvedMediaType,
      width: null,
      height: null,
      thumbnailIpfs: convertIpfsToHttp(image),
    };

    const creatorSplits = creators.map((creator) => ({
      address: normalizeAddress(creator.creator),
      bps: Number(creator.bps),
    }));

    await context.db
      .insert(submissions)
      .values({
        id: slug,
        slug,
        contractAddress,
        chainId,
        name,
        url: normalizedUrl,
        thumbnailUrl,
        description,
        body: text,
        creators: creatorSplits,
        sponsorAddress,
        pieceId: normalizedPieceId,
        logicContractVersion: "v1",
        onchainSlug: null,
        votesWeight: 0,
        mediaMetadata,
        muxStreamData: null,
        muxStreamUrl: null,
        tokenURI: null,
        hasBeenDropped: false,
        isHidden: false,
        isOnchain: true,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoUpdate(() => ({
        slug,
        contractAddress,
        chainId,
        name,
        url: normalizedUrl,
        thumbnailUrl,
        description,
        body: text,
        creators: creatorSplits,
        sponsorAddress,
        pieceId: normalizedPieceId,
        logicContractVersion: "v1",
        mediaMetadata,
        muxStreamData: null,
        muxStreamUrl: null,
        tokenURI: null,
        isOnchain: true,
        updatedAt: timestamp,
      }));

    // NOTE: Offchain merge/mux side effects are intentionally skipped here.
  },
);
