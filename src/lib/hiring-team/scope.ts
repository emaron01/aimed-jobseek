/** Personas that belong to one application. Product-level rows stay out of selectors. */
export function applicationPersonaWhere(campaignId: string): {
  campaignId: string;
  archivedAt: null;
} {
  return { campaignId, archivedAt: null };
}

/** Email and contact selectors list only this application's roles. */
export function applicationPersonaOptions(input: {
  applicationPersonas: Array<{ id: string; name: string }>;
  inPlay: Array<{ personaId: string; name: string }>;
}): Array<{ id: string; name: string }> {
  const allowed = new Set(input.applicationPersonas.map((persona) => persona.id));
  const inPlay = input.inPlay
    .filter((row) => allowed.has(row.personaId))
    .map((row) => ({ id: row.personaId, name: row.name }));
  return inPlay.length > 0 ? inPlay : input.applicationPersonas;
}
