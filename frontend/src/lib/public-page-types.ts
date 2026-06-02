export type AuthorT = {
  id: string;
  handle: string;
  displayName: string;
  profilePicture: string | null;
};

export type ProfileT = {
  id: string;
  handle: string;
  displayName: string;
  bio: string | null;
  profilePicture: string | null;
  createdAt: string;
  postCount: number;
};

export type PostT = {
  id: string;
  body: string;
  imageUrl: string | null;
  createdAt: string;
  author: AuthorT;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  likedByMe: boolean;
};

export type CommentT = {
  id: string;
  postId: string;
  body: string;
  createdAt: string;
  parentCommentId: string | null;
  author: AuthorT;
  likeCount: number;
  likedByMe: boolean;
  replies?: CommentT[];
};
