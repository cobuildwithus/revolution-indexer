import { formatEther } from "viem";

import { normalizeAddress, toBlockTimestamp } from "./culture-index";

type ExecutionData = Array<{
  calldata: string;
  signature: string;
  target: string;
  value: { eth: number; quantity: number };
}>;

type ProposalStatus = "pending" | "active" | "queued" | "executed" | "cancelled" | "vetoed";

type LastUpdated = { blockNumber: number; transactionIndex: number; logIndex: number };

// Fixed DAO -> token mapping to preserve legacy entityId format.
const DAO_TOKEN_BY_ADDRESS: Record<string, `0x${string}`> = {
  "0x613b7ddca4b05355b3541f8c018b374987549e79": "0x9ea7fd1b8823a271bec99b205b6c0c56d7c3eae9",
  "0xc052ace88f0a8dfc58ba10b9c6de02357fba0cd7": "0xebf2d8b25d3dcc3371d54c6727c207c4f3080b8c",
};

export const getDaoTokenContract = (daoAddress: string) =>
  DAO_TOKEN_BY_ADDRESS[normalizeAddress(daoAddress)];

export const getRevolutionEntityId = (chainId: number, tokenContract: string) =>
  `ethereum-${chainId}-revolution-${normalizeAddress(tokenContract)}`;

export const getProposalUniqueId = (entityId: string, proposalId: string) =>
  `${entityId}-${proposalId}`;

export const getVoteUniqueId = (entityId: string, voter: string, proposalId: string) =>
  `${entityId}-${normalizeAddress(voter)}-${proposalId}`;

export const getEventPosition = (event: {
  block: { number: bigint };
  transaction: { transactionIndex: number };
  log: { logIndex: number };
}): LastUpdated => ({
  blockNumber: Number(event.block.number),
  transactionIndex: event.transaction.transactionIndex ?? 0,
  logIndex: event.log.logIndex ?? 0,
});

// Legacy ordering guard to avoid double-counting proposal/vote updates.
export const isAlreadyUpdated = (eventPosition: LastUpdated, lastUpdated?: LastUpdated | null) => {
  if (!lastUpdated) return false;

  if (lastUpdated.blockNumber < eventPosition.blockNumber) return false;
  if (
    lastUpdated.blockNumber === eventPosition.blockNumber &&
    eventPosition.transactionIndex &&
    lastUpdated.transactionIndex < eventPosition.transactionIndex
  ) {
    return false;
  }
  if (
    lastUpdated.blockNumber === eventPosition.blockNumber &&
    lastUpdated.transactionIndex === eventPosition.transactionIndex &&
    eventPosition.logIndex &&
    lastUpdated.logIndex < eventPosition.logIndex
  ) {
    return false;
  }
  return true;
};

export const calculateProposalStatus = (
  startBlock: number | null,
  startTimestamp: number | null,
  blockTimestamp: Date,
  currentBlockNumber: number,
): ProposalStatus => {
  if (startBlock && currentBlockNumber >= startBlock) {
    return "active";
  }
  if (startTimestamp) {
    return startTimestamp <= blockTimestamp.getTime() ? "active" : "pending";
  }
  return "pending";
};

// Mirrors legacy payout/execution data conversion (including Number(...) cast).
export const getProposalPayoutAndExecutionData = (decoded: {
  targets: readonly string[];
  values: readonly bigint[];
  signatures: readonly string[];
  calldatas: readonly string[];
}) => {
  const executionDatas: ExecutionData = [];
  const { calldatas, signatures, targets, values } = decoded;

  if (!calldatas || !signatures || !targets || !values) {
    throw new Error("Missing decoded data");
  }

  let totalPayout = {
    quantity: BigInt(0),
    eth: BigInt(0),
  };

  for (let i = 0; i < targets.length; i += 1) {
    const target = targets[i];
    const signature = signatures[i];
    const calldata = calldatas[i];
    const ethValue = values[i];

    if (!target || !signature || !calldata || ethValue === undefined) {
      throw new Error("Missing decoded data");
    }

    totalPayout.quantity = totalPayout.quantity + ethValue;
    totalPayout.eth += ethValue;

    executionDatas.push({
      calldata,
      signature,
      target,
      value: {
        quantity: Number(ethValue),
        eth: parseFloat(formatEther(ethValue)),
      },
    });
  }

  return {
    totalPayout: {
      quantity: totalPayout.quantity.toString(),
      eth: parseFloat(formatEther(totalPayout.eth)),
    },
    executionDatas,
  };
};

export const buildProposalRecord = (args: {
  proposalId: string;
  proposer: string;
  targets: readonly string[];
  values: readonly bigint[];
  signatures: readonly string[];
  calldatas: readonly string[];
  startBlock: number;
  endBlock: number;
  proposalThreshold: bigint;
  description: string;
  entityId: string;
  tokenContract: string;
  governanceContract: string;
  chainId: number;
  blockNumber: number;
  blockTimestamp: Date;
  transactionHash: string;
}) => {
  const {
    proposalId,
    proposer,
    targets,
    values,
    signatures,
    calldatas,
    startBlock,
    endBlock,
    proposalThreshold,
    description,
    entityId,
    tokenContract,
    governanceContract,
    chainId,
    blockNumber,
    blockTimestamp,
    transactionHash,
  } = args;

  const uniqueId = getProposalUniqueId(entityId, proposalId);
  const status = calculateProposalStatus(startBlock, null, blockTimestamp, blockNumber);

  const { totalPayout, executionDatas } = getProposalPayoutAndExecutionData({
    targets,
    values,
    signatures,
    calldatas,
  });

  return {
    id: uniqueId,
    v: 0,
    auctionId: null,
    chainId,
    blockchain: "ethereum",
    calldatas: [...calldatas],
    creation: {
      date: blockTimestamp,
      block: blockNumber,
      transactionHash,
    },
    customFields: null,
    description,
    entityId,
    lastUpdated: {
      blockNumber: 0,
      transactionIndex: 0,
      logIndex: 0,
    },
    metadata: {
      startBlock,
      startDate: null,
      endDate: null,
      endBlock,
    },
    network: "mainnet",
    options: {
      "0": { name: "Against", voteCount: "0", uniqueVotes: 0, executionData: [] },
      "1": { name: "For", voteCount: "0", uniqueVotes: 0, executionData: executionDatas },
      "2": { name: "Abstain", voteCount: "0", uniqueVotes: 0, executionData: [] },
    },
    trackerType: "revolution_dao_v1",
    payoutAmount: totalPayout,
    proposalId,
    proposer: normalizeAddress(proposer),
    signatures: [...signatures],
    status,
    strategy: {
      proposalThreshold: proposalThreshold.toString(),
      snapshotBlock: startBlock,
    },
    targets: targets.map((target) => normalizeAddress(target)),
    title: null,
    tokenContract: normalizeAddress(tokenContract),
    governanceContract: normalizeAddress(governanceContract),
    totalUniqueVotes: 0,
    totalVotes: "0",
    type: "revolution",
    uniqueId,
    updatedAt: blockTimestamp,
    values: values.map((value) => value.toString()),
  };
};

export const buildVoteRecord = (args: {
  proposalId: string;
  voter: string;
  support: number;
  votes: bigint;
  reason: string;
  entityId: string;
  tokenContract: string;
  chainId: number;
  blockNumber: number;
  blockTimestamp: Date;
}) => {
  const {
    proposalId,
    voter,
    support,
    votes,
    reason,
    entityId,
    tokenContract,
    chainId,
    blockNumber,
    blockTimestamp,
  } = args;

  const uniqueId = getVoteUniqueId(entityId, voter, proposalId);

  return {
    id: uniqueId,
    v: null,
    blockchain: "ethereum",
    countedInProposal: false,
    name: null,
    chainId,
    entityId,
    lastUpdated: {
      blockNumber: 0,
      transactionIndex: 0,
      logIndex: 0,
    },
    network: "mainnet",
    optionId: support,
    proposalId,
    reason: reason || "",
    tokenContract: normalizeAddress(tokenContract),
    type: "revolution",
    uniqueId,
    updatedAt: blockTimestamp,
    votedAt: {
      block: blockNumber,
      time: blockTimestamp,
    },
    voter: normalizeAddress(voter),
    weight: votes.toString(),
  };
};

export const getBlockTimestampFromEvent = (timestamp: bigint) => toBlockTimestamp(timestamp);
