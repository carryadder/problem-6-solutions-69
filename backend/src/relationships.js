import { prisma } from './db.js';

export async function getBlockRecord(userId, otherUserId) {
  return prisma.userBlock.findFirst({
    where: {
      OR: [
        { blockerId: userId, blockedUserId: otherUserId },
        { blockerId: otherUserId, blockedUserId: userId },
      ],
    },
  });
}

export async function getConversationBlockState(conversationId, userId) {
  const members = await prisma.conversationMember.findMany({
    where: { conversationId },
    select: { userId: true },
    take: 2,
  });

  const otherUserId = members.find((member) => member.userId !== userId)?.userId || null;
  if (!otherUserId) {
    return { otherUserId: null, blockedByMe: false, hasBlockedMe: false };
  }

  const block = await getBlockRecord(userId, otherUserId);
  return {
    otherUserId,
    blockedByMe: block?.blockerId === userId,
    hasBlockedMe: block?.blockerId === otherUserId,
  };
}

export async function usersAreBlocked(userId, otherUserId) {
  const block = await getBlockRecord(userId, otherUserId);
  return {
    blocked: Boolean(block),
    blockedByMe: block?.blockerId === userId,
    hasBlockedMe: block?.blockerId === otherUserId,
  };
}
