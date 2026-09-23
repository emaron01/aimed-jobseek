-- Remove unedited product-default Hiring Team templates.
-- A template the seeker edited has updatedAt after createdAt and is kept.
-- Seeker-created templates have a null templateKey and are kept.
-- Existing persona rows stay. personaTemplateId becomes null when its template is removed.

DELETE FROM "PersonaTemplate"
WHERE "templateKey" IN (
  'recruiter',
  'hr_people_partner',
  'hiring_manager',
  'hiring_manager_executive',
  'cross_functional_lead'
)
AND "updatedAt" <= "createdAt" + INTERVAL '2 seconds';
