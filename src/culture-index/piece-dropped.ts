import { ponder } from "ponder:registry";
import type { IndexingFunctionArgs } from "ponder:registry";
import { submissions } from "ponder:schema";

import {
  generateSubmissionSlug,
  normalizeAddress,
  toBlockTimestamp,
} from "./helpers";

ponder.on(
  "CultureIndex:PieceDropped",
  async ({ event, context }: IndexingFunctionArgs<"CultureIndex:PieceDropped">) => {
    const { pieceId } = event.args;

    const chainId = context.chain.id;
    const contractAddress = normalizeAddress(event.log.address);
    const slug = generateSubmissionSlug(chainId, contractAddress, pieceId.toString());
    const timestamp = toBlockTimestamp(event.block.timestamp);

    await context.db.update(submissions, { id: slug }).set({
      hasBeenDropped: true,
      updatedAt: timestamp,
    });
  },
);
