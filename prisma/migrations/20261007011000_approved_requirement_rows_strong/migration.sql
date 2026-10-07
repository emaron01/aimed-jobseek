-- One-time catch-up for approvals made before "approving an interview answer
-- that fills a requirement row sets that row to STRONG" shipped.
-- Same rule as approveConsultationStatement: the question card's target key,
-- or the statement turn's key when the answer is not on a card. Interview
-- answers only. Requirement rows and why-this-company qualify.
-- Acknowledge-the-gap (gapDecision no_evidence), resume bullets, and other
-- cards are left as stored. Only strength changes.
-- Idempotent: a second run matches no PARTIAL or NONE rows.

UPDATE "ConsultationAssessment" AS assessment
SET strength = 'STRONG'::"EvidenceStrength"
WHERE assessment.strength IN ('PARTIAL'::"EvidenceStrength", 'NONE'::"EvidenceStrength")
  AND (
    btrim(assessment."targetKey") ~ '^(required|outcome|competency|preferred|mission):'
    OR btrim(assessment."targetKey") = 'why-this-company'
  )
  AND EXISTS (
    SELECT 1
    FROM "ConsultationStatement" AS statement
    JOIN "ConsultationTurn" AS turn ON turn.id = statement."turnId"
    WHERE statement."sessionId" = assessment."sessionId"
      AND statement.kind = 'INTERVIEW_ANSWER'::"ConsultationStatementKind"
      AND statement.status = 'APPROVED'::"ConsultationStatementStatus"
      AND COALESCE(turn."analysisJson"->>'gapDecision', '') <> 'no_evidence'
      AND btrim(assessment."targetKey") = COALESCE(
        (
          SELECT NULLIF(btrim(card."targetKey"), '')
          FROM "ConsultationTurn" AS linked
          JOIN "ConsultationTurn" AS card
            ON card."sessionId" = linked."sessionId"
           AND card.speaker = 'CONSULTANT'::"ConsultationSpeaker"
           AND card."followUp" = false
           AND card.intent IS DISTINCT FROM 'CLOSING'
           AND card.intent IS DISTINCT FROM 'COACHING'
           AND (
             card.id = linked.id
             OR card.id = NULLIF(linked."analysisJson"->>'replyToTurnId', '')
             OR (
               linked."followUp" = true
               AND card.sequence < linked.sequence
               AND (
                 linked."targetKey" IS NULL
                 OR btrim(linked."targetKey") = ''
                 OR card."targetKey" = linked."targetKey"
               )
             )
           )
          WHERE turn.speaker = 'SEEKER'::"ConsultationSpeaker"
            AND COALESCE(turn."analysisJson"->>'ignored', 'false') <> 'true'
            AND turn.intent IS DISTINCT FROM 'NOT_ACCURATE'
            AND linked."sessionId" = turn."sessionId"
            AND linked.speaker = 'CONSULTANT'::"ConsultationSpeaker"
            AND (
              linked.id = NULLIF(turn."analysisJson"->>'replyToTurnId', '')
              OR turn."targetKey" = 'question:' || linked.id
            )
          ORDER BY
            CASE
              WHEN card.id = linked.id THEN 0
              WHEN card.id = NULLIF(linked."analysisJson"->>'replyToTurnId', '') THEN 1
              ELSE 2
            END,
            card.sequence DESC
          LIMIT 1
        ),
        NULLIF(btrim(turn."targetKey"), '')
      )
  );
