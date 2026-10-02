import React, { useMemo, useState } from 'react';
import { createApiClient, getErrorMessage, isUnauthorizedError } from '@plumiotheca/api-client';
import type { ApiClient, StoryStatus } from '@plumiotheca/api-client';

interface AppProps {
  /** Provided by the shell. Built locally when the remote runs standalone. */
  api?: ApiClient;
  isAuthenticated?: boolean;
}

const cardStyle: React.CSSProperties = {
  padding: '20px',
  border: '2px solid #3498db',
  borderRadius: '8px',
};

const fieldStyle: React.CSSProperties = { padding: '8px' };

const App: React.FC<AppProps> = ({ api, isAuthenticated = false }) => {
  const client = useMemo(
    () =>
      api ?? createApiClient({ baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:3000' }),
    [api],
  );

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [status, setStatus] = useState<StoryStatus>('draft');
  const [chapterTitle, setChapterTitle] = useState('Chapitre 1');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setTags('');
    setStatus('draft');
    setChapterTitle('Chapitre 1');
    setContent('');
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);

    try {
      const story = await client.stories.create({
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
      });

      if (content.trim()) {
        await client.stories.createChapter(story.id, {
          title: chapterTitle.trim() || 'Chapitre 1',
          content: content.trim(),
          order: 1,
        });
      }

      setSuccess(
        `« ${story.title} » enregistrée (#${story.id})` +
          (status === 'published' ? ' et publiée.' : ' en brouillon.'),
      );
      resetForm();
    } catch (err) {
      setError(
        isUnauthorizedError(err)
          ? 'Vous devez être connecté pour publier une histoire.'
          : getErrorMessage(err),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={cardStyle}>
      <h2>✍️ Module Écriture (Editor)</h2>

      {!isAuthenticated && (
        <p style={{ color: '#c0392b' }}>
          Vous n'êtes pas connecté : la publication sera refusée par l'API. Connectez-vous depuis
          l'en-tête pour enregistrer vos histoires.
        </p>
      )}

      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <input
          type="text"
          placeholder="Titre de votre histoire"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
          style={fieldStyle}
        />
        <textarea
          placeholder="Résumé de l'histoire"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={2}
          style={fieldStyle}
        />
        <input
          type="text"
          placeholder="Tags séparés par des virgules (fantasy, aventure…)"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
          style={fieldStyle}
        />
        <input
          type="text"
          placeholder="Titre du premier chapitre"
          value={chapterTitle}
          onChange={(event) => setChapterTitle(event.target.value)}
          style={fieldStyle}
        />
        <textarea
          placeholder="Il était une fois..."
          value={content}
          onChange={(event) => setContent(event.target.value)}
          rows={5}
          style={fieldStyle}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          Statut
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as StoryStatus)}
            style={fieldStyle}
          >
            <option value="draft">Brouillon</option>
            <option value="published">Publiée</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={submitting || !title.trim()}
          style={{
            padding: '10px',
            backgroundColor: submitting ? '#95a5a6' : '#3498db',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: submitting ? 'default' : 'pointer',
          }}
        >
          {submitting ? 'Enregistrement…' : 'Publier'}
        </button>
      </form>

      {error && <p style={{ color: '#c0392b' }}>{error}</p>}
      {success && <p style={{ color: '#27ae60' }}>{success}</p>}
    </div>
  );
};

export default App;
