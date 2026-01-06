import { ponder } from "ponder:registry";
import type { IndexingFunctionArgs } from "ponder:registry";
import { submissions, upvotes } from "ponder:schema";

import {
  generateSubmissionSlug,
  normalizeAddress,
  toBlockTimestamp,
} from "./helpers";

ponder.on(
  "CultureIndex:VoteCast",
  async ({ event, context }: IndexingFunctionArgs<"CultureIndex:VoteCast">) => {
    const { pieceId, voter, weight, totalWeight } = event.args;

    const chainId = context.chain.id;
    const contractAddress = normalizeAddress(event.log.address);
    const slug = generateSubmissionSlug(chainId, contractAddress, pieceId.toString());
    const timestamp = toBlockTimestamp(event.block.timestamp);

    await context.db.update(submissions, { id: slug }).set({
      votesWeight: Number(totalWeight),
      updatedAt: timestamp,
    });

    const normalizedVoter = normalizeAddress(voter);
    const uniqueId = `${slug}-${normalizedVoter}`;

    await context.db
      .insert(upvotes)
      .values({
        id: uniqueId,
        voter: normalizedVoter,
        weight: Number(weight),
        strategy: "culture-index-v1",
        chainId,
        version: 1,
        snapshot: Number(event.block.number),
        slug,
        networkAddress: contractAddress,
        uniqueId,
        createdAt: timestamp,
        updatedAt: timestamp,
        stale: false,
      })
      .onConflictDoUpdate(() => ({
        voter: normalizedVoter,
        weight: Number(weight),
        strategy: "culture-index-v1",
        chainId,
        version: 1,
        snapshot: Number(event.block.number),
        slug,
        networkAddress: contractAddress,
        updatedAt: timestamp,
      }));
  },
);
