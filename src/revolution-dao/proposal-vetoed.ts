import { ponder } from "ponder:registry";
import type { IndexingFunctionArgs } from "ponder:registry";

import { normalizeAddress } from "../culture-index/helpers";
import { getDaoContext, getEventPosition, getProposalUniqueId } from "./helpers";
import { updateProposalStatus } from "./update-proposal-status";

ponder.on(
  "RevolutionDao:ProposalVetoed",
  async ({ event, context }: IndexingFunctionArgs<"RevolutionDao:ProposalVetoed">) => {
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
      },
      context,
    );
  },
);
