import { wordCount, type ChapterDocument } from '@plumiotheca/editor-schema';
import { EditorContent, useEditor, type JSONContent } from '@tiptap/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router';
import { ApiError } from '../../shared/api/client';
import { Button } from '../../shared/ui/Button';
import { Alert, Loading } from '../../shared/ui/Feedback';
import { TextField } from '../../shared/ui/Field';
import { Page } from '../../shared/ui/Page';
import { useDraft, useStory, useWriterActions } from '../stories/api';
import { formatNumber } from '../stories/labels';
import styles from './ChapterEditor.module.css';
import { editorExtensions } from './extensions';
import { Toolbar } from './Toolbar';

/** Délai de la sauvegarde automatique après la dernière frappe. */
const AUTOSAVE_MS = 2000;

/** Copie de secours locale (onglet fermé, coupure réseau) : jamais une donnée partagée. */
interface Backup {
  version: number;
  doc: JSONContent;
  at: string;
}
const backupKey = (chapterId: string) => `plumiotheca.brouillon.${chapterId}`;

function readBackup(chapterId: string): Backup | null {
  try {
    const raw = localStorage.getItem(backupKey(chapterId));
    return raw ? (JSON.parse(raw) as Backup) : null;
  } catch {
    return null;
  }
}
function writeBackup(chapterId: string, backup: Backup | null) {
  try {
    if (backup) localStorage.setItem(backupKey(chapterId), JSON.stringify(backup));
    else localStorage.removeItem(backupKey(chapterId));
  } catch {
    // Stockage plein ou indisponible : la sauvegarde serveur reste la référence.
  }
}

const time = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

type SaveState =
  | { kind: 'idle' }
  | { kind: 'dirty' }
  | { kind: 'saving' }
  | { kind: 'saved'; at: string }
  | { kind: 'conflict' }
  | { kind: 'error'; message: string };

/**
 * Éditeur de chapitre (#25) : mise en forme de base, sauvegarde automatique avec version
 * contrôlée par l'API, copie de secours locale, aucune perte en quittant la page.
 */
export function ChapterEditorPage() {
  const { storyId = '', chapterId = '' } = useParams();
  const draft = useDraft(storyId, chapterId);
  if (draft.isPending) return <Loading label="Chargement du chapitre…" />;
  if (draft.isError) {
    return (
      <Page title="Chapitre introuvable" width="narrow">
        <Alert tone="danger" title="Ce chapitre n’a pas pu être chargé.">
          <p>{draft.error.message}</p>
        </Alert>
      </Page>
    );
  }
  // Une clé par chapitre : changer de chapitre recrée l'éditeur.
  return <Editor key={chapterId} storyId={storyId} chapterId={chapterId} initial={draft.data} />;
}

function Editor({
  storyId,
  chapterId,
  initial,
}: {
  storyId: string;
  chapterId: string;
  initial: NonNullable<ReturnType<typeof useDraft>['data']>;
}) {
  const story = useStory(storyId);
  const actions = useWriterActions(storyId);
  const navigate = useNavigate();
  const [title, setTitle] = useState(initial.title);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [words, setWords] = useState(initial.wordCount);
  const version = useRef(initial.draftVersion);
  const dirty = useRef(false);
  const timer = useRef<number>(undefined);
  // onUpdate est mémorisé par TipTap au premier rendu : il passe par cette référence
  // pour toujours appeler la version à jour de persist().
  const persistRef = useRef<() => Promise<boolean>>(() => Promise.resolve(true));
  const [backup, setBackup] = useState<Backup | null>(() => {
    const found = readBackup(chapterId);
    // Copie locale plus récente que le brouillon enregistré : on la propose.
    return found &&
      found.version === initial.draftVersion &&
      JSON.stringify(found.doc) !== JSON.stringify(initial.draft)
      ? found
      : null;
  });
  const language = story.data?.language ?? 'fr';

  const editor = useEditor({
    extensions: editorExtensions,
    content: initial.draft as JSONContent,
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Texte du chapitre',
        'aria-describedby': 'aide-editeur',
        class: styles.prose!,
        lang: language,
        spellcheck: 'true',
      },
    },
    onUpdate: ({ editor: e }) => {
      const doc = e.getJSON();
      dirty.current = true;
      setSave({ kind: 'dirty' });
      setWords(wordCount(doc as ChapterDocument, language));
      writeBackup(chapterId, { version: version.current, doc, at: new Date().toISOString() });
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => void persistRef.current(), AUTOSAVE_MS);
    },
  });

  /** Enregistre le brouillon ; vrai si tout est enregistré. */
  const persist = useCallback(async (): Promise<boolean> => {
    if (!editor || !dirty.current) return true;
    window.clearTimeout(timer.current);
    const doc = editor.getJSON();
    dirty.current = false;
    setSave({ kind: 'saving' });
    try {
      const saved = await actions.saveDraft.mutateAsync({
        chapterId,
        draft: doc,
        version: version.current,
      });
      version.current = saved.draftVersion;
      setWords(saved.wordCount);
      // L'API a complété des identifiants de blocs : on reprend son document, sans bouger
      // le curseur, pour que les identifiants restent les mêmes à la sauvegarde suivante.
      if (saved.draft && !dirty.current) {
        const { from, to } = editor.state.selection;
        editor.commands.setContent(saved.draft as JSONContent, { emitUpdate: false });
        const max = editor.state.doc.content.size;
        editor.commands.setTextSelection({ from: Math.min(from, max), to: Math.min(to, max) });
      }
      if (!dirty.current) writeBackup(chapterId, null);
      setSave(dirty.current ? { kind: 'dirty' } : { kind: 'saved', at: time() });
      return !dirty.current;
    } catch (error) {
      dirty.current = true;
      if (error instanceof ApiError && error.status === 409) setSave({ kind: 'conflict' });
      else {
        setSave({
          kind: 'error',
          message:
            error instanceof ApiError && error.status === 400
              ? error.message
              : 'Enregistrement impossible pour l’instant. Votre texte est gardé dans ce navigateur ; nouvel essai à la prochaine modification.',
        });
      }
      return false;
    }
  }, [editor, actions.saveDraft, chapterId]);
  useEffect(() => {
    persistRef.current = persist;
  }, [persist]);

  // Quitter la page pour une autre page du site : on enregistre d'abord.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty.current && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    void persist().then((ok) => (ok ? blocker.proceed() : blocker.reset()));
  }, [blocker, persist]);

  // Fermer l'onglet avec des modifications en attente : le navigateur demande confirmation
  // (la copie locale garde de toute façon le texte).
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      window.removeEventListener('beforeunload', warn);
      window.clearTimeout(timer.current);
    };
  }, []);

  if (!editor) return <Loading label="Ouverture de l’éditeur…" />;

  const restore = () => {
    if (!backup) return;
    editor.commands.setContent(backup.doc, { emitUpdate: true });
    setBackup(null);
  };

  const publish = async () => {
    if (actions.publishChapter.isPending) return;
    if (!(await persist())) return;
    actions.publishChapter.mutate(chapterId, {
      onSuccess: () => void navigate(`/ecrire/histoires/${storyId}`),
    });
  };

  const status =
    save.kind === 'dirty'
      ? 'Modifications non enregistrées…'
      : save.kind === 'saving'
        ? 'Enregistrement…'
        : save.kind === 'saved'
          ? `Enregistré à ${save.at}`
          : '';

  return (
    <Page
      title={title || 'Chapitre sans titre'}
      documentTitle={`${title || 'Chapitre'} (écriture)`}
      lead={
        story.data
          ? `${story.data.title} · ${initial.status === 'published' ? 'publié (vous modifiez le brouillon)' : 'brouillon'}`
          : undefined
      }
    >
      {backup && (
        <Alert tone="warning" live title="Une version non enregistrée a été retrouvée.">
          <p>
            Ce navigateur a gardé des modifications du {new Date(backup.at).toLocaleString('fr-FR')}{' '}
            qui n’avaient pas été enregistrées.
          </p>
          <div className={styles.row}>
            <Button size="small" variant="primary" onClick={restore}>
              Reprendre cette version
            </Button>
            <Button
              size="small"
              onClick={() => {
                writeBackup(chapterId, null);
                setBackup(null);
              }}
            >
              L’ignorer
            </Button>
          </div>
        </Alert>
      )}

      <div className={styles.bar}>
        <output className={styles.status}>{status}</output>
        <span className={styles.words}>{formatNumber(words)} mots</span>
        <Button variant="secondary" pending={save.kind === 'saving'} onClick={() => void persist()}>
          Enregistrer
        </Button>
        <Button
          variant="primary"
          pending={actions.publishChapter.isPending}
          onClick={() => void publish()}
        >
          {initial.status === 'published' ? 'Publier la nouvelle version' : 'Publier le chapitre'}
        </Button>
      </div>

      {save.kind === 'conflict' && (
        <Alert tone="warning" live title="Ce chapitre a été modifié ailleurs.">
          <p>
            Un autre onglet (ou une co-autrice, un co-auteur) a enregistré une autre version. Votre
            texte est gardé dans ce navigateur : rechargez la page, puis reprenez votre version si
            besoin.
          </p>
        </Alert>
      )}
      {save.kind === 'error' && (
        <Alert tone="danger" live title="Le brouillon n’a pas été enregistré.">
          <p>{save.message}</p>
        </Alert>
      )}
      {actions.publishChapter.isError && (
        <Alert tone="danger" live title="Le chapitre n’a pas pu être publié.">
          <p>{actions.publishChapter.error.message}</p>
        </Alert>
      )}

      <TextField
        label="Titre du chapitre"
        value={title}
        maxLength={200}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => {
          if (title.trim() !== initial.title) {
            actions.renameChapter.mutate({ chapterId, title: title.trim() });
          }
        }}
      />

      <div className={styles.editor}>
        <Toolbar editor={editor} />
        <p id="aide-editeur" className={styles.help}>
          Enregistrement automatique. Raccourcis : Ctrl+B gras, Ctrl+I italique ; « --- » en début
          de ligne pour un changement de scène.
        </p>
        <EditorContent editor={editor} />
      </div>

      <p>
        <Link to={`/ecrire/histoires/${storyId}`}>Retour à l’histoire</Link>
      </p>
    </Page>
  );
}
