import { ponder } from "ponder:registry";
import type { IndexingFunctionArgs } from "ponder:registry";
import { proposals } from "ponder:schema";

import { normalizeAddress, toBlockTimestamp } from "../culture-index/helpers";
import {
  buildProposalRecord,
  getDaoContext,
} from "./helpers";

ponder.on(
  "RevolutionDao:ProposalCreatedWithRequirements",
  async ({
    event,
    context,
  }: IndexingFunctionArgs<"RevolutionDao:ProposalCreatedWithRequirements">) => {
    const {
      id,
      proposer,
      targets,
      values,
      signatures,
      calldatas,
      startBlock,
      endBlock,
      proposalThreshold,
      description,
    } = event.args;

    const chainId = context.chain.id;
    const governanceContract = normalizeAddress(event.log.address);
    const daoContext = getDaoContext(governanceContract, chainId);
    if (!daoContext) return;

    const proposalId = id.toString();
    const proposalRecord = buildProposalRecord({
      proposalId,
      proposer,
      targets,
      values,
      signatures,
      calldatas: calldatas.map((data) => data.toString()),
      startBlock: Number(startBlock),
      endBlock: Number(endBlock),
      proposalThreshold,
      description,
      entityId: daoContext.entityId,
      tokenContract: daoContext.tokenContract,
      governanceContract,
      chainId,
      blockNumber: Number(event.block.number),
      blockTimestamp: toBlockTimestamp(event.block.timestamp),
      transactionHash: event.transaction.hash,
    });

    const { id: _id, ...proposalUpdate } = proposalRecord;

    await context.db
      .insert(proposals)
      .values(proposalRecord)
      .onConflictDoUpdate(() => proposalUpdate);
  },
);
