ALTER TABLE "ConversationMember"
ADD COLUMN "wallpaper" TEXT NOT NULL DEFAULT 'aurora';

CREATE TABLE "UserBlock" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserBlock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserBlock_blockerId_blockedUserId_key" ON "UserBlock"("blockerId", "blockedUserId");
CREATE INDEX "UserBlock_blockedUserId_idx" ON "UserBlock"("blockedUserId");

ALTER TABLE "UserBlock"
ADD CONSTRAINT "UserBlock_blockerId_fkey"
FOREIGN KEY ("blockerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserBlock"
ADD CONSTRAINT "UserBlock_blockedUserId_fkey"
FOREIGN KEY ("blockedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "UserReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reportedUserId" TEXT NOT NULL,
    "conversationId" TEXT,
    "reason" VARCHAR(80) NOT NULL,
    "details" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserReport_reporterId_createdAt_idx" ON "UserReport"("reporterId", "createdAt");
CREATE INDEX "UserReport_reportedUserId_createdAt_idx" ON "UserReport"("reportedUserId", "createdAt");
CREATE INDEX "UserReport_conversationId_idx" ON "UserReport"("conversationId");

ALTER TABLE "UserReport"
ADD CONSTRAINT "UserReport_reporterId_fkey"
FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserReport"
ADD CONSTRAINT "UserReport_reportedUserId_fkey"
FOREIGN KEY ("reportedUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserReport"
ADD CONSTRAINT "UserReport_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
