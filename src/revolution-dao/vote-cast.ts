import { ponder } from "ponder:registry";
import type { IndexingFunctionArgs } from "ponder:registry";
import { proposals, votes } from "ponder:schema";

import { normalizeAddress, toBlockTimestamp } from "../culture-index/helpers";
import {
  buildVoteRecord,
  getDaoContext,
  getEventPosition,
  getProposalUniqueId,
  getVoteUniqueId,
  isAlreadyUpdated,
  parseLastUpdated,
} from "./helpers";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const normalizeOption = (value: unknown) => {
  const record = isRecord(value) ? value : {};
  const voteCount = typeof record.voteCount === "string" ? record.voteCount : "0";
  const uniqueVotes = typeof record.uniqueVotes === "number" ? record.uniqueVotes : 0;
  const executionData = Array.isArray(record.executionData) ? record.executionData : [];

  return {
    ...record,
    voteCount,
    uniqueVotes,
    executionData,
  };
};

ponder.on(
  "RevolutionDao:VoteCast",
  async ({ event, context }: IndexingFunctionArgs<"RevolutionDao:VoteCast">) => {
    const { voter, proposalId, support, votes: voteWeight, reason } = event.args;

    const chainId = context.chain.id;
    const governanceContract = normalizeAddress(event.log.address);
    const daoContext = getDaoContext(governanceContract, chainId);
    if (!daoContext) return;

    const proposalIdString = proposalId.toString();
    const timestamp = toBlockTimestamp(event.block.timestamp);
    const voteRecord = buildVoteRecord({
      proposalId: proposalIdString,
      voter,
      support: Number(support),
      votes: voteWeight,
      reason,
      entityId: daoContext.entityId,
      tokenContract: daoContext.tokenContract,
      chainId,
      blockNumber: Number(event.block.number),
      blockTimestamp: timestamp,
    });

    const { id: _id, ...voteUpdate } = voteRecord;

    await context.db.insert(votes).values(voteRecord).onConflictDoUpdate(() => voteUpdate);

    const proposalUniqueId = getProposalUniqueId(daoContext.entityId, proposalIdString);
    const proposal = await context.db.find(proposals, { id: proposalUniqueId });

    if (!proposal) {
      console.warn("Skipping vote tally: missing proposal", {
        proposalId: proposalIdString,
        entityId: daoContext.entityId,
      });
      return;
    }

    if (proposal.status === "pending") {
      await context.db.update(proposals, { id: proposalUniqueId }).set({
        status: "active",
      });
    }

    const eventPosition = getEventPosition(event);
    const proposalLastUpdated = parseLastUpdated(proposal.lastUpdated);
    if (!isAlreadyUpdated(eventPosition, proposalLastUpdated)) {
      const options = isRecord(proposal.options) ? proposal.options : {};
      const optionKey = String(voteRecord.optionId);
      const option = normalizeOption(options[optionKey]);

      const updatedOption = {
        ...option,
        voteCount: (BigInt(option.voteCount) + BigInt(voteRecord.weight)).toString(),
        uniqueVotes: option.uniqueVotes + 1,
      };

      await context.db.update(proposals, { id: proposalUniqueId }).set({
        options: { ...options, [optionKey]: updatedOption },
        totalUniqueVotes: proposal.totalUniqueVotes + 1,
        totalVotes: (BigInt(proposal.totalVotes) + BigInt(voteRecord.weight)).toString(),
        lastUpdated: eventPosition,
      });
    }

    const voteUniqueId = getVoteUniqueId(daoContext.entityId, voter, proposalIdString);
    const vote = await context.db.find(votes, { id: voteUniqueId });

    if (!vote) return;

    const voteLastUpdated = parseLastUpdated(vote.lastUpdated);
    if (!isAlreadyUpdated(eventPosition, voteLastUpdated)) {
      await context.db.update(votes, { id: voteUniqueId }).set({
        countedInProposal: true,
        lastUpdated: eventPosition,
      });
    }
  },
);
