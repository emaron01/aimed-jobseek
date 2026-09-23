/**
 * Product-specific prompt content for AimedJobSeek.
 *
 * Instructions, rules, and examples live here. Payload assembly, version
 * constants, model calls, and parsing stay in the shared generation modules
 * (for example `@/lib/product-research/prompt.ts` and `contract.ts`).
 *
 * Later slices add a file beside this one and import it from the existing
 * assembler. Do not put sales or job-seeker instructions back into the
 * assembler, and do not change other areas' prompts from a slice that is
 * not theirs.
 */

export { PROFILE_SYNTHESIS_SYSTEM_INSTRUCTIONS } from "./profile-synthesis";
export { ICP_INTERPRETATION_SYSTEM_INSTRUCTIONS } from "./icp-interpretation";
