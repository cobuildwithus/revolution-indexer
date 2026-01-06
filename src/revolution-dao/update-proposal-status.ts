import type { Context } from "ponder:registry";
import { proposals } from "ponder:schema";

import { isAlreadyUpdated, parseLastUpdated, type LastUpdated } from "./helpers";

type RevolutionDaoContext = Context<"RevolutionDao:ProposalCreatedWithRequirements">;

type ProposalRow = typeof proposals.$inferSelect;

type UpdateParams = {
  proposalUniqueId: string;
  newStatus: string;
  eventPosition: LastUpdated;
};

export const updateProposalStatus = async (
  params: UpdateParams,
  context: RevolutionDaoContext,
) => {
  const { proposalUniqueId, newStatus, eventPosition } = params;
  const proposal: ProposalRow | null = await context.db.find(proposals, {
    id: proposalUniqueId,
  });

  if (!proposal) {
    console.warn("Skipping proposal status update: missing proposal", { proposalUniqueId });
    return;
  }

  const lastUpdated = parseLastUpdated(proposal.lastUpdated);
  if (isAlreadyUpdated(eventPosition, lastUpdated)) {
    return;
  }

  await context.db.update(proposals, { id: proposalUniqueId }).set({
    status: newStatus,
    lastUpdated: eventPosition,
  });
};
