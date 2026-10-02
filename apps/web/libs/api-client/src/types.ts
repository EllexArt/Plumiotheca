export interface User {
  id: number;
  username: string;
  email?: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Tag {
  id: number;
  name: string;
}

export interface Chapter {
  id: number;
  title: string;
  content: string;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export type StoryStatus = 'draft' | 'published';

export interface Story {
  id: number;
  title: string;
  description?: string;
  coverUrl?: string;
  author?: User;
  chapters?: Chapter[];
  tags?: Tag[];
  viewsCount: number;
  likesCount: number;
  status: StoryStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StoryInput {
  title: string;
  description?: string;
  coverUrl?: string;
  tags?: string[];
  status?: StoryStatus;
}

export interface ChapterInput {
  title: string;
  content: string;
  order: number;
}

export interface ProfileInput {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
}
