import { ponder } from "ponder:registry";

// Side-effect imports register indexing handlers.
import "./auction-house";
import { proposals, submissions, upvotes, votes } from "ponder:schema";

import {
  convertIpfsToHttp,
  generateSubmissionSlug,
  getMediaType,
  isSupportedMediaUrl,
  normalizeAddress,
  toBlockTimestamp,
} from "./lib/culture-index";
import {
  buildProposalRecord,
  buildVoteRecord,
  getDaoTokenContract,
  getEventPosition,
  getProposalUniqueId,
  getRevolutionEntityId,
  getVoteUniqueId,
  isAlreadyUpdated,
} from "./lib/revolution-dao";

ponder.on("CultureIndex:PieceCreated", async ({ event, context }) => {
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

  const creatorSplits = creators.map((creator: { creator: string; bps: bigint }) => ({
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
});

ponder.on("CultureIndex:VoteCast", async ({ event, context }) => {
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
});

ponder.on("CultureIndex:PieceDropped", async ({ event, context }) => {
  const { pieceId } = event.args;

  const chainId = context.chain.id;
  const contractAddress = normalizeAddress(event.log.address);
  const slug = generateSubmissionSlug(chainId, contractAddress, pieceId.toString());
  const timestamp = toBlockTimestamp(event.block.timestamp);

  await context.db.update(submissions, { id: slug }).set({
    hasBeenDropped: true,
    updatedAt: timestamp,
  });
});

// Resolve DAO entityId using fixed token contracts to match legacy ingestion.
const getDaoContext = (daoAddress: string, chainId: number) => {
  const tokenContract = getDaoTokenContract(daoAddress);
  if (!tokenContract) {
    console.warn("Skipping DAO event: unknown DAO address", { daoAddress });
    return null;
  }
  const entityId = getRevolutionEntityId(chainId, tokenContract);
  return { entityId, tokenContract };
};

// Shared status updater with legacy lastUpdated guard.
const updateProposalStatus = async (
  params: {
    proposalUniqueId: string;
    newStatus: string;
    eventPosition: { blockNumber: number; transactionIndex: number; logIndex: number };
    timestamp: Date;
  },
  context: { db: any },
) => {
  const { proposalUniqueId, newStatus, eventPosition, timestamp } = params;
  const proposal = await context.db.find(proposals, { id: proposalUniqueId });

  if (!proposal) {
    console.warn("Skipping proposal status update: missing proposal", { proposalUniqueId });
    return;
  }

  if (isAlreadyUpdated(eventPosition, proposal.lastUpdated as any)) {
    return;
  }

  await context.db.update(proposals, { id: proposalUniqueId }).set({
    status: newStatus,
    lastUpdated: eventPosition,
  });
};

ponder.on("RevolutionDao:ProposalCreatedWithRequirements", async ({ event, context }) => {
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
  const timestamp = toBlockTimestamp(event.block.timestamp);
  const proposalRecord = buildProposalRecord({
    proposalId,
    proposer,
    targets,
    values,
    signatures,
    calldatas: calldatas.map((data: `0x${string}`) => data.toString()),
    startBlock: Number(startBlock),
    endBlock: Number(endBlock),
    proposalThreshold,
    description,
    entityId: daoContext.entityId,
    tokenContract: daoContext.tokenContract,
    governanceContract,
    chainId,
    blockNumber: Number(event.block.number),
    blockTimestamp: timestamp,
    transactionHash: event.transaction.hash,
  });

  const { id: _id, ...proposalUpdate } = proposalRecord;

  await context.db
    .insert(proposals)
    .values(proposalRecord)
    .onConflictDoUpdate(() => proposalUpdate);
});

ponder.on("RevolutionDao:ProposalCanceled", async ({ event, context }) => {
  const chainId = context.chain.id;
  const governanceContract = normalizeAddress(event.log.address);
  const daoContext = getDaoContext(governanceContract, chainId);
  if (!daoContext) return;

  const proposalId = event.args.id.toString();
  const proposalUniqueId = getProposalUniqueId(daoContext.entityId, proposalId);
  const eventPosition = getEventPosition(event);

  await updateProposalStatus(
    {
      proposalUniqueId,
      newStatus: "cancelled",
      eventPosition,
      timestamp: toBlockTimestamp(event.block.timestamp),
    },
    context,
  );
});

ponder.on("RevolutionDao:ProposalVetoed", async ({ event, context }) => {
  const chainId = context.chain.id;
  const governanceContract = normalizeAddress(event.log.address);
  const daoContext = getDaoContext(governanceContract, chainId);
  if (!daoContext) return;

  const proposalId = event.args.id.toString();
  const proposalUniqueId = getProposalUniqueId(daoContext.entityId, proposalId);
  const eventPosition = getEventPosition(event);

  await updateProposalStatus(
    {
      proposalUniqueId,
      newStatus: "vetoed",
      eventPosition,
      timestamp: toBlockTimestamp(event.block.timestamp),
    },
    context,
  );
});

ponder.on("RevolutionDao:ProposalExecuted", async ({ event, context }) => {
  const chainId = context.chain.id;
  const governanceContract = normalizeAddress(event.log.address);
  const daoContext = getDaoContext(governanceContract, chainId);
  if (!daoContext) return;

  const proposalId = event.args.id.toString();
  const proposalUniqueId = getProposalUniqueId(daoContext.entityId, proposalId);
  const eventPosition = getEventPosition(event);

  await updateProposalStatus(
    {
      proposalUniqueId,
      newStatus: "executed",
      eventPosition,
      timestamp: toBlockTimestamp(event.block.timestamp),
    },
    context,
  );
});

ponder.on("RevolutionDao:ProposalQueued", async ({ event, context }) => {
  const chainId = context.chain.id;
  const governanceContract = normalizeAddress(event.log.address);
  const daoContext = getDaoContext(governanceContract, chainId);
  if (!daoContext) return;

  const proposalId = event.args.id.toString();
  const proposalUniqueId = getProposalUniqueId(daoContext.entityId, proposalId);
  const eventPosition = getEventPosition(event);

  await updateProposalStatus(
    {
      proposalUniqueId,
      newStatus: "queued",
      eventPosition,
      timestamp: toBlockTimestamp(event.block.timestamp),
    },
    context,
  );
});

ponder.on("RevolutionDao:VoteCast", async ({ event, context }) => {
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
  if (!isAlreadyUpdated(eventPosition, proposal.lastUpdated as any)) {
    const options = proposal.options as Record<string, any>;
    const optionKey = String(voteRecord.optionId);
    const option = options[optionKey] || { voteCount: "0", uniqueVotes: 0, executionData: [] };

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

  if (!isAlreadyUpdated(eventPosition, vote.lastUpdated as any)) {
    await context.db.update(votes, { id: voteUniqueId }).set({
      countedInProposal: true,
      lastUpdated: eventPosition,
    });
  }
});
