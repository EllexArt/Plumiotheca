import type { ChapterRead, StoryDetail } from '@plumiotheca/contracts';

/**
 * Histoires téléchargées (#35), dans IndexedDB : la fiche, et chaque chapitre publié tel
 * qu'on le lit. Elles restent sur l'appareil, connecté ou non (choix validé), jusqu'à ce
 * qu'on les supprime. Rien d'autre n'y est gardé (ni compte, ni position de lecture).
 */
const DB = 'plumiotheca-hors-ligne';
const STORIES = 'histoires';
const CHAPTERS = 'chapitres';

export interface DownloadedStory {
  story: StoryDetail;
  /** Date du téléchargement (ISO). */
  savedAt: string;
  /** Place prise, en octets (texte des chapitres et fiche). */
  bytes: number;
}

interface StoredChapter {
  id: string;
  storyId: string;
  chapter: ChapterRead;
}

let opening: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore(STORIES, { keyPath: 'story.id' });
      db.createObjectStore(CHAPTERS, { keyPath: 'id' }).createIndex('storyId', 'storyId');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      opening = null;
      reject(request.error ?? new Error('Stockage de l’appareil indisponible'));
    };
  });
  return opening;
}

/** Oublie la connexion ouverte (tests : une base neuve à chaque fois). */
export function forgetOfflineStore() {
  opening = null;
}

const done = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('Écriture impossible sur l’appareil'));
    tx.onabort = () => reject(tx.error ?? new Error('Écriture interrompue sur l’appareil'));
  });

const result = <T>(request: IDBRequest<T>) =>
  new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Lecture impossible sur l’appareil'));
  });

/** Garde une histoire et ses chapitres, en remplaçant une version précédente. */
export async function saveStory(story: StoryDetail, chapters: ChapterRead[]): Promise<void> {
  const db = await open();
  const bytes = new Blob([JSON.stringify(story), JSON.stringify(chapters)]).size;
  const tx = db.transaction([STORIES, CHAPTERS], 'readwrite');
  const stored = tx.objectStore(CHAPTERS);
  const old = await result(stored.index('storyId').getAllKeys(story.id));
  for (const key of old) stored.delete(key);
  for (const chapter of chapters) {
    stored.put({ id: chapter.id, storyId: story.id, chapter } satisfies StoredChapter);
  }
  tx.objectStore(STORIES).put({
    story,
    savedAt: new Date().toISOString(),
    bytes,
  } satisfies DownloadedStory);
  await done(tx);
}

export async function downloadedStory(id: string): Promise<DownloadedStory | undefined> {
  const db = await open();
  return result<DownloadedStory | undefined>(db.transaction(STORIES).objectStore(STORIES).get(id));
}

export async function downloadedChapter(id: string): Promise<ChapterRead | undefined> {
  const db = await open();
  const stored = await result<StoredChapter | undefined>(
    db.transaction(CHAPTERS).objectStore(CHAPTERS).get(id),
  );
  return stored?.chapter;
}

/** Toutes les histoires téléchargées, la plus récente d'abord. */
export async function downloadedStories(): Promise<DownloadedStory[]> {
  const db = await open();
  const all = await result<DownloadedStory[]>(
    db.transaction(STORIES).objectStore(STORIES).getAll(),
  );
  return all.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export async function removeStory(id: string): Promise<void> {
  const db = await open();
  const tx = db.transaction([STORIES, CHAPTERS], 'readwrite');
  const chapters = tx.objectStore(CHAPTERS);
  for (const key of await result(chapters.index('storyId').getAllKeys(id))) chapters.delete(key);
  tx.objectStore(STORIES).delete(id);
  await done(tx);
}

export async function removeAllStories(): Promise<void> {
  const db = await open();
  const tx = db.transaction([STORIES, CHAPTERS], 'readwrite');
  tx.objectStore(STORIES).clear();
  tx.objectStore(CHAPTERS).clear();
  await done(tx);
}
