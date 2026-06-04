ALTER TABLE "ConversationMember"
ADD COLUMN "archivedAt" TIMESTAMP(3),
ADD COLUMN "folder" TEXT NOT NULL DEFAULT 'inbox';

ALTER TABLE "Message"
ADD COLUMN "imageUrl" TEXT;
