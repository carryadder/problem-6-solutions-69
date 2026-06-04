ALTER TABLE "Conversation"
ADD COLUMN "pinnedMessageId" TEXT;

CREATE UNIQUE INDEX "Conversation_pinnedMessageId_key" ON "Conversation"("pinnedMessageId");

ALTER TABLE "Conversation"
ADD CONSTRAINT "Conversation_pinnedMessageId_fkey"
FOREIGN KEY ("pinnedMessageId") REFERENCES "Message"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Message"
ADD COLUMN "deletedForEveryoneAt" TIMESTAMP(3);

CREATE TABLE "MessageStar" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageStar_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessageStar_messageId_userId_key" ON "MessageStar"("messageId", "userId");
CREATE INDEX "MessageStar_userId_createdAt_idx" ON "MessageStar"("userId", "createdAt");

ALTER TABLE "MessageStar"
ADD CONSTRAINT "MessageStar_messageId_fkey"
FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageStar"
ADD CONSTRAINT "MessageStar_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MessageHidden" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageHidden_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MessageHidden_messageId_userId_key" ON "MessageHidden"("messageId", "userId");
CREATE INDEX "MessageHidden_userId_createdAt_idx" ON "MessageHidden"("userId", "createdAt");

ALTER TABLE "MessageHidden"
ADD CONSTRAINT "MessageHidden_messageId_fkey"
FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MessageHidden"
ADD CONSTRAINT "MessageHidden_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
