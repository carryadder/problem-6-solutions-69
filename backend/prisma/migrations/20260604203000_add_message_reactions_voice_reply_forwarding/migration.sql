ALTER TABLE "Message"
ALTER COLUMN "body" SET DEFAULT '';

ALTER TABLE "Message"
ADD COLUMN "audioUrl" TEXT,
ADD COLUMN "replyToId" TEXT,
ADD COLUMN "forwardedFromMessageId" TEXT;

CREATE INDEX "Message_replyToId_idx" ON "Message"("replyToId");
CREATE INDEX "Message_forwardedFromMessageId_idx" ON "Message"("forwardedFromMessageId");

ALTER TABLE "Message"
ADD CONSTRAINT "Message_replyToId_fkey"
FOREIGN KEY ("replyToId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Message"
ADD CONSTRAINT "Message_forwardedFromMessageId_fkey"
FOREIGN KEY ("forwardedFromMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "MessageReaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" VARCHAR(16) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageReaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessageReaction_messageId_userId_key" ON "MessageReaction"("messageId", "userId");
CREATE INDEX "MessageReaction_userId_createdAt_idx" ON "MessageReaction"("userId", "createdAt");

ALTER TABLE "MessageReaction"
ADD CONSTRAINT "MessageReaction_messageId_fkey"
FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageReaction"
ADD CONSTRAINT "MessageReaction_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
