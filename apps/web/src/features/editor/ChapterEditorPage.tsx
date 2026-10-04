import { ChapterDraft } from '@plumiotheca/contracts';
import { wordCount, type ChapterDocument } from '@plumiotheca/editor-schema';
import { useQueryClient } from '@tanstack/react-query';
import {
  EditorContent,
  useEditor,
  type Editor as TiptapEditor,
  type JSONContent,
} from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router';
import { ApiError } from '../../shared/api/client';
import { useApi } from '../../shared/api/useApi';
import { Button } from '../../shared/ui/Button';
import { Alert, Loading } from '../../shared/ui/Feedback';
import { TextField } from '../../shared/ui/Field';
import { Page } from '../../shared/ui/Page';
import { storyKeys, useDraft, useStory, useWriterActions } from '../stories/api';
import { formatNumber } from '../stories/labels';
import { readBackup, writeBackup, type Backup } from './backup';
import styles from './ChapterEditor.module.css';
import { editorExtensions } from './extensions';
import { MOD, Toolbar } from './Toolbar';

/** Délai de la sauvegarde automatique après la dernière frappe. */
const AUTOSAVE_MS = 2000;
/** Nouvel essai après une erreur passagère (réseau, API indisponible). */
const RETRY_MS = 10_000;

const time = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

type Progress =
  { kind: 'idle' } | { kind: 'dirty' } | { kind: 'saving' } | { kind: 'saved'; at: string };
type Problem = { kind: 'conflict' } | { kind: 'error'; message: string } | null;
type Draft = ChapterDraft;

/**
 * Remplace le document par celui de l'API (identifiants complétés) sans étape d'annulation
 * ni perte de la sélection et des marques en attente (Ctrl+B avant de taper).
 */
function adopt(editor: TiptapEditor, json: JSONContent) {
  const { state } = editor;
  const doc = state.schema.nodeFromJSON(json);
  const tr = state.tr.replaceWith(0, state.doc.content.size, doc.content);
  const max = tr.doc.content.size;
  const { anchor, head } = state.selection;
  tr.setSelection(TextSelection.create(tr.doc, Math.min(anchor, max), Math.min(head, max)));
  if (state.storedMarks) tr.setStoredMarks(state.storedMarks);
  editor.view.dispatch(tr.setMeta('addToHistory', false));
}

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
        <p>
          <Link to={`/ecrire/histoires/${storyId}`}>Retour à l’histoire</Link>
        </p>
      </Page>
    );
  }
  // Une clé par chapitre : changer de chapitre recrée l'éditeur.
  return <Editor key={chapterId} storyId={storyId} chapterId={chapterId} initial={draft.data} />;
}

/**
 * Sauvegarde du brouillon : une seule à la fois (une demande pendant un envoi attend sa fin,
 * puis part avec la bonne version), cache du brouillon tenu à jour, erreurs gardées jusqu'à
 * la réussite suivante, nouvel essai automatique après une erreur passagère.
 */
function useDraftSaver(
  editor: TiptapEditor | null,
  { storyId, chapterId, initial }: { storyId: string; chapterId: string; initial: Draft },
) {
  const api = useApi();
  const queryClient = useQueryClient();
  const { saveDraft } = useWriterActions(storyId);
  const [progress, setProgress] = useState<Progress>({ kind: 'idle' });
  const [problem, setProblem] = useState<Problem>(null);
  const [words, setWords] = useState(initial.wordCount);
  const version = useRef(initial.draftVersion);
  const dirty = useRef(false);
  const conflict = useRef(false);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const timer = useRef<number>(undefined);
  // Les minuteurs passent par cette référence pour toujours appeler la version à jour de
  // persist() (un minuteur garde sinon la fonction du rendu où il a été posé).
  const persistRef = useRef<() => Promise<boolean>>(() => Promise.resolve(true));

  const schedule = useCallback((ms: number, run: () => void) => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(run, ms);
  }, []);

  /** Garde le cache du brouillon à jour : rouvrir le chapitre montre la dernière version. */
  const remember = useCallback(
    (doc: unknown, draftVersion: number, count: number) =>
      queryClient.setQueryData<Draft>(storyKeys.draft(storyId, chapterId), (old) =>
        old ? { ...old, draft: doc, draftVersion, wordCount: count } : old,
      ),
    [queryClient, storyId, chapterId],
  );

  const persist = useCallback(async (): Promise<boolean> => {
    while (inFlight.current) await inFlight.current;
    if (!editor || conflict.current) return !dirty.current;
    if (!dirty.current) return true;
    window.clearTimeout(timer.current);
    const doc = editor.getJSON();
    dirty.current = false;
    setProgress({ kind: 'saving' });
    const run = (async () => {
      try {
        const saved = await saveDraft.mutateAsync({
          chapterId,
          draft: doc,
          version: version.current,
        });
        version.current = saved.draftVersion;
        setWords(saved.wordCount);
        // L'API a complété des identifiants de blocs : on reprend son document, sans bouger
        // le curseur, pour que les identifiants restent les mêmes à la sauvegarde suivante.
        if (saved.draft && !dirty.current) adopt(editor, saved.draft as JSONContent);
        remember(saved.draft ?? doc, saved.draftVersion, saved.wordCount);
        setProblem(null);
        if (dirty.current) {
          // Frappe pendant l'envoi : la copie de secours suit la nouvelle version, et la
          // sauvegarde suivante (déjà programmée) partira avec elle.
          writeBackup(chapterId, {
            version: saved.draftVersion,
            doc: editor.getJSON(),
            at: new Date().toISOString(),
          });
          setProgress({ kind: 'dirty' });
          return false;
        }
        writeBackup(chapterId, null);
        setProgress({ kind: 'saved', at: time() });
        return true;
      } catch (error) {
        dirty.current = true;
        setProgress({ kind: 'dirty' });
        if (error instanceof ApiError && error.status === 409) {
          conflict.current = true;
          setProblem({ kind: 'conflict' });
        } else if (error instanceof ApiError && error.status === 400) {
          // La vraie raison est dans le détail de la réponse (« Requête invalide » sinon).
          const reason = error.problem.errors?.[0]?.message;
          setProblem({
            kind: 'error',
            message: reason
              ? `${reason}. Corrigez ce passage ; votre texte reste gardé dans cet onglet.`
              : error.message,
          });
        } else {
          setProblem({
            kind: 'error',
            message:
              'Enregistrement impossible pour l’instant. Votre texte reste gardé dans cet onglet ; nouvel essai automatique dans quelques secondes.',
          });
          schedule(RETRY_MS, () => void persistRef.current());
        }
        return false;
      } finally {
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
  }, [editor, saveDraft, chapterId, remember, schedule]);

  useEffect(() => {
    persistRef.current = persist;
  }, [persist]);

  /** À chaque frappe : copie de secours, compteur, sauvegarde différée. */
  const changed = useCallback(
    (doc: JSONContent, language: string) => {
      dirty.current = true;
      setProgress({ kind: 'dirty' });
      setWords(wordCount(doc as ChapterDocument, language));
      writeBackup(chapterId, { version: version.current, doc, at: new Date().toISOString() });
      if (!conflict.current) schedule(AUTOSAVE_MS, () => void persistRef.current());
    },
    [chapterId, schedule],
  );

  /** Relit le brouillon enregistré (résolution d'un conflit). */
  const latest = () => api(ChapterDraft, `/histoires/${storyId}/chapitres/${chapterId}/brouillon`);

  /** Conflit : ma version remplace celle qui a été enregistrée ailleurs. */
  const keepMine = async () => {
    const saved = await latest();
    version.current = saved.draftVersion;
    conflict.current = false;
    dirty.current = true;
    setProblem(null);
    await persist();
  };

  /**
   * Conflit : on reprend la version enregistrée ailleurs. La mienne est mise de côté en copie
   * de secours, et rendue pour être proposée en reprise.
   */
  const loadSaved = async (): Promise<Backup | null> => {
    const saved = await latest();
    const mine = editor?.getJSON();
    editor?.commands.setContent(saved.draft as JSONContent, { emitUpdate: false });
    version.current = saved.draftVersion;
    conflict.current = false;
    dirty.current = false;
    remember(saved.draft, saved.draftVersion, saved.wordCount);
    setWords(saved.wordCount);
    setProblem(null);
    setProgress({ kind: 'idle' });
    if (!mine) return null;
    const aside = { version: saved.draftVersion, doc: mine, at: new Date().toISOString() };
    writeBackup(chapterId, aside);
    return aside;
  };

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { persist, changed, progress, problem, words, dirty, keepMine, loadSaved };
}

function Editor({
  storyId,
  chapterId,
  initial,
}: {
  storyId: string;
  chapterId: string;
  initial: Draft;
}) {
  const story = useStory(storyId);
  const actions = useWriterActions(storyId);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const language = story.data?.language ?? 'fr';

  const [title, setTitle] = useState(initial.title);
  const [savedTitle, setSavedTitle] = useState(initial.title);
  const [backup, setBackup] = useState<Backup | null>(() => {
    const found = readBackup(chapterId);
    // Copie différente du brouillon enregistré : on la propose, même si elle part d'une
    // version plus ancienne (conflit, frappe pendant un envoi).
    return found && JSON.stringify(found.doc) !== JSON.stringify(initial.draft) ? found : null;
  });

  const changedRef = useRef<(doc: JSONContent, language: string) => void>(() => {});
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
    onUpdate: ({ editor: e }) => changedRef.current(e.getJSON(), language),
  });
  const saver = useDraftSaver(editor, { storyId, chapterId, initial });
  useEffect(() => {
    changedRef.current = saver.changed;
  }, [saver.changed]);

  /** Titre : enregistré seulement s'il a changé ; vrai si rien n'est en attente. */
  const saveTitle = useCallback(async (): Promise<boolean> => {
    const next = title.trim();
    if (next === savedTitle) return true;
    try {
      await actions.renameChapter.mutateAsync({ chapterId, title: next });
      setSavedTitle(next);
      queryClient.setQueryData<Draft>(storyKeys.draft(storyId, chapterId), (old) =>
        old ? { ...old, title: next } : old,
      );
      return true;
    } catch {
      return false;
    }
  }, [title, savedTitle, actions.renameChapter, chapterId, queryClient, storyId]);

  // Texte ou titre en attente d'enregistrement (lu par le blocage de navigation et
  // l'avertissement de fermeture, hors du rendu).
  const pending = useRef(false);
  useEffect(() => {
    pending.current = saver.dirty.current || title.trim() !== savedTitle;
  });

  // Quitter la page pour une autre page du site : on enregistre d'abord.
  // Fonction stable : une nouvelle fonction à chaque rendu réinitialiserait le blocage
  // pendant l'enregistrement.
  const shouldBlock = useCallback(
    ({
      currentLocation,
      nextLocation,
    }: {
      currentLocation: { pathname: string };
      nextLocation: { pathname: string };
    }) => pending.current && currentLocation.pathname !== nextLocation.pathname,
    [],
  );
  const blocker = useBlocker(shouldBlock);
  const leaving = useRef(false);
  useEffect(() => {
    // Garde-fou relâché seulement quand le routeur a fini (sinon un rendu intermédiaire,
    // encore « bloqué », relancerait proceed()).
    if (blocker.state === 'unblocked') leaving.current = false;
    if (blocker.state !== 'blocked' || leaving.current) return;
    leaving.current = true;
    void Promise.all([saver.persist(), saveTitle()]).then(([text, name]) => {
      if (text && name) blocker.proceed();
      // Enregistrement impossible : on le dit, et on laisse partir si la personne le veut
      // (le texte reste dans la copie de secours de l'onglet).
      else if (
        window.confirm(
          'Les dernières modifications n’ont pas pu être enregistrées. Elles restent gardées dans cet onglet : vous pourrez les reprendre en revenant sur ce chapitre. Quitter quand même ?',
        )
      )
        blocker.proceed();
      else blocker.reset();
    });
  }, [blocker, saver, saveTitle]);

  // Fermer l'onglet avec des modifications en attente : le navigateur demande confirmation
  // (la copie locale garde de toute façon le texte).
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (pending.current) event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  if (!editor) return <Loading label="Ouverture de l’éditeur…" />;

  const restore = () => {
    if (!backup) return;
    editor.commands.setContent(backup.doc, { emitUpdate: true });
    setBackup(null);
  };

  const saving = saver.progress.kind === 'saving';
  const publish = async () => {
    if (actions.publishChapter.isPending) return;
    const [text, name] = await Promise.all([saver.persist(), saveTitle()]);
    if (!text || !name) return;
    actions.publishChapter.mutate(chapterId, {
      onSuccess: () => void navigate(`/ecrire/histoires/${storyId}`),
    });
  };

  const status =
    saver.progress.kind === 'dirty'
      ? 'Modifications non enregistrées'
      : saver.progress.kind === 'saving'
        ? 'Enregistrement…'
        : saver.progress.kind === 'saved'
          ? `Enregistré à ${saver.progress.at}`
          : '';

  return (
    <Page
      title={savedTitle || 'Chapitre sans titre'}
      documentTitle={`${savedTitle || 'Chapitre'} (écriture)`}
      lead={
        story.data
          ? `${story.data.title} · ${initial.status === 'published' ? 'publié (vous modifiez le brouillon)' : 'brouillon'}`
          : undefined
      }
    >
      {backup && (
        <Alert tone="warning" live title="Une version non enregistrée a été retrouvée.">
          <p>
            Cet onglet a gardé des modifications du {new Date(backup.at).toLocaleString('fr-FR')}{' '}
            qui n’avaient pas été enregistrées.
            {backup.version < initial.draftVersion &&
              ' Une autre version a été enregistrée depuis (autre onglet, co-écriture) : reprendre celle-ci la remplacera.'}
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
        {/* Visible, mais pas annoncé à chaque pause : seules les erreurs le sont (alertes). */}
        <p className={styles.status}>{status}</p>
        <span className={styles.words}>{formatNumber(saver.words)} mots</span>
        <Button variant="secondary" pending={saving} onClick={() => void saver.persist()}>
          Enregistrer
        </Button>
        <Button
          variant="primary"
          pending={saving || actions.publishChapter.isPending}
          onClick={() => void publish()}
        >
          {initial.status === 'published' ? 'Publier la nouvelle version' : 'Publier le chapitre'}
        </Button>
      </div>

      {saver.problem?.kind === 'conflict' && (
        <Alert tone="warning" live title="Ce chapitre a été enregistré ailleurs entre-temps.">
          <p>
            Un autre onglet, une co-autrice ou un co-auteur a enregistré une autre version. Votre
            texte reste gardé dans cet onglet. Que voulez-vous faire ?
          </p>
          <div className={styles.row}>
            <Button size="small" variant="primary" onClick={() => void saver.keepMine()}>
              Garder ma version
            </Button>
            <Button size="small" onClick={() => void saver.loadSaved().then(setBackup)}>
              Charger la version enregistrée
            </Button>
          </div>
        </Alert>
      )}
      {saver.problem?.kind === 'error' && (
        <Alert tone="danger" live title="Le brouillon n’a pas été enregistré.">
          <p>{saver.problem.message}</p>
        </Alert>
      )}
      {actions.renameChapter.isError && (
        <Alert tone="danger" live title="Le titre n’a pas été enregistré.">
          <p>{actions.renameChapter.error.message}</p>
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
        onBlur={() => void saveTitle()}
      />

      <div className={styles.editor}>
        <Toolbar editor={editor} />
        <p id="aide-editeur" className={styles.help}>
          Enregistrement automatique. Raccourcis : {MOD === 'Meta' ? 'Cmd' : 'Ctrl'}+B gras,{' '}
          {MOD === 'Meta' ? 'Cmd' : 'Ctrl'}+I italique ; « --- » en début de ligne pour un
          changement de scène.
        </p>
        <EditorContent editor={editor} />
      </div>

      <p>
        <Link to={`/ecrire/histoires/${storyId}`}>Retour à l’histoire</Link>
      </p>
    </Page>
  );
}
