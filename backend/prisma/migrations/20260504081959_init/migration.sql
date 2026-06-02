-- Add setup completion state for the Phase 3 profile onboarding flow.
ALTER TABLE "User"
ADD COLUMN "setupComplete" BOOLEAN NOT NULL DEFAULT false;
