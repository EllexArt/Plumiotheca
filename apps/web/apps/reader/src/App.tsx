import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createApiClient, getErrorMessage } from '@plumiotheca/api-client';
import type { ApiClient, Chapter, Story } from '@plumiotheca/api-client';

interface AppProps {
  /** Provided by the shell. Built locally when the remote runs standalone. */
  api?: ApiClient;
}

const cardStyle: React.CSSProperties = {
  padding: '20px',
  border: '2px solid #2ecc71',
  borderRadius: '8px',
};

const App: React.FC<AppProps> = ({ api }) => {
  const client = useMemo(
    () =>
      api ?? createApiClient({ baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000' }),
    [api],
  );

  const [stories, setStories] = useState<Story[]>([]);
  const [selected, setSelected] = useState<Story | null>(null);
  const [openChapter, setOpenChapter] = useState<Chapter | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setStories(await client.stories.list());
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    // Chargement initial depuis l'API (prototype ; remplacé par TanStack Query, #19).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStories();
  }, [loadStories]);

  const openStory = async (story: Story) => {
    setLoading(true);
    setError(null);
    try {
      const full = await client.stories.get(story.id);
      setSelected(full);
      setOpenChapter(full.chapters?.[0] ?? null);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const backToList = () => {
    setSelected(null);
    setOpenChapter(null);
  };

  if (error) {
    return (
      <div style={cardStyle}>
        <h2>📚 Module Lecture (Reader)</h2>
        <p style={{ color: '#c0392b' }}>Impossible de charger les histoires : {error}</p>
        <button
          onClick={() => void loadStories()}
          style={{ padding: '8px 12px', cursor: 'pointer' }}
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div style={cardStyle}>
        <h2>📚 Module Lecture (Reader)</h2>
        <p>Chargement…</p>
      </div>
    );
  }

  if (selected) {
    const chapters = selected.chapters ?? [];
    return (
      <div style={cardStyle}>
        <button onClick={backToList} style={{ padding: '6px 10px', cursor: 'pointer' }}>
          ← Retour aux histoires
        </button>
        <h2 style={{ marginBottom: '4px' }}>{selected.title}</h2>
        <p style={{ color: '#7f8c8d', marginTop: 0 }}>
          par {selected.author?.displayName || selected.author?.username || 'Auteur inconnu'}
          {' · '}
          {selected.viewsCount} vue{selected.viewsCount > 1 ? 's' : ''}
        </p>
        {selected.description && <p>{selected.description}</p>}

        {chapters.length === 0 ? (
          <p>Cette histoire n'a pas encore de chapitre.</p>
        ) : (
          <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
            <ul style={{ listStyle: 'none', padding: 0, minWidth: '200px' }}>
              {chapters.map((chapter) => (
                <li key={chapter.id} style={{ marginBottom: '6px' }}>
                  <button
                    onClick={() => setOpenChapter(chapter)}
                    style={{
                      padding: '6px 10px',
                      cursor: 'pointer',
                      width: '100%',
                      textAlign: 'left',
                      backgroundColor: openChapter?.id === chapter.id ? '#2ecc71' : 'white',
                      color: openChapter?.id === chapter.id ? 'white' : 'inherit',
                      border: '1px solid #2ecc71',
                      borderRadius: '4px',
                    }}
                  >
                    {chapter.order}. {chapter.title}
                  </button>
                </li>
              ))}
            </ul>
            <article style={{ whiteSpace: 'pre-wrap', flex: 1 }}>
              {openChapter ? openChapter.content : 'Sélectionnez un chapitre.'}
            </article>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={cardStyle}>
      <h2>📚 Module Lecture (Reader)</h2>
      {stories.length === 0 ? (
        <p>Aucune histoire publiée pour l'instant.</p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {stories.map((story) => (
            <li key={story.id} style={{ marginBottom: '12px' }}>
              <button
                onClick={() => void openStory(story)}
                style={{
                  padding: '10px',
                  cursor: 'pointer',
                  width: '100%',
                  textAlign: 'left',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  backgroundColor: 'white',
                }}
              >
                <strong>{story.title}</strong>
                <span style={{ color: '#7f8c8d' }}>
                  {' '}
                  — {story.author?.displayName || story.author?.username || 'Auteur inconnu'}
                </span>
                {story.description && (
                  <div style={{ color: '#7f8c8d', marginTop: '4px' }}>{story.description}</div>
                )}
                {story.tags && story.tags.length > 0 && (
                  <div style={{ marginTop: '6px' }}>
                    {story.tags.map((tag) => (
                      <span
                        key={tag.id}
                        style={{
                          marginRight: '6px',
                          padding: '2px 8px',
                          backgroundColor: '#ecf0f1',
                          borderRadius: '10px',
                          fontSize: '12px',
                        }}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default App;
