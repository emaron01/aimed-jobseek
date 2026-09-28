/**
 * Single implementation of "process all unprocessed consultation input from the DB".
 * Lives outside service.ts so processConsultationReply can be mocked in tests.
 */
import {
  listIncompleteConsultationSeekerTurns,
  processConsultationReply,
} from "@/lib/consultation/service";

export async function drainConsultationUnprocessedInput(input: {
  organizationId: string;
  campaignId: string;
}): Promise<number> {
  const turns = await listIncompleteConsultationSeekerTurns(input);
  for (const turn of turns) {
    await processConsultationReply({
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      sessionId: turn.sessionId,
      turnId: turn.id,
    });
  }
  return turns.length;
}
