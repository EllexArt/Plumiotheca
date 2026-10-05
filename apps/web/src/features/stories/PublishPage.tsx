import {
  handleKey,
  type ContentWarning,
  type MajorWarning,
  type Rating,
  type StoryDetail,
  type UpdateStory,
} from '@plumiotheca/contracts';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { Button, ButtonLink } from '../../shared/ui/Button';
import { Alert, Loading, Tag } from '../../shared/ui/Feedback';
import { Page } from '../../shared/ui/Page';
import { useMyAccount } from '../account/api';
import { useStory, useWriterActions } from './api';
import {
  completionLabel,
  contentWarningsText,
  coverColors,
  plural,
  ratingLabel,
  warningsText,
} from './labels';
import {
  focusFirstError,
  readStoryForm,
  readWarnings,
  StoryFields,
  type Errors,
} from './StoryForm';
import styles from './Publish.module.css';
import reading from './Reading.module.css';

/** Ce que la carte montrera, lu au fil de la saisie (même si un autre champ est invalide). */
interface Preview {
  rating: Rating | null;
  majorWarnings: MajorWarning[] | null;
  contentWarnings: ContentWarning[];
  tags: string[];
}

/** Tags tels que l'API les gardera à peu près : un seul par forme, sans tenir compte de la casse. */
function uniqueTags(tags: string[]): string[] {
  const seen = new Set<string>();
  return tags.filter((tag) => {
    const key = tag.toLocaleLowerCase('fr').replace(/\s+/g, ' ');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function readPreview(form: HTMLFormElement): Preview {
  const data = new FormData(form);
  return {
    rating: (data.get('rating') as Rating | null) || null,
    majorWarnings: readWarnings(data).value,
    contentWarnings: data.getAll('contentWarnings') as ContentWarning[],
    tags: uniqueTags(
      String(data.get('tags') ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    ),
  };
}

/** Ce qui manque encore pour publier, dans l'ordre du formulaire. */
function missingItems(preview: Preview, publishedChapters: number) {
  const missing: string[] = [];
  if (!preview.rating) missing.push('le classement');
  if (preview.majorWarnings === null) missing.push('les avertissements majeurs');
  if (!publishedChapters) missing.push('au moins un chapitre publié');
  return missing;
}

/** « Avant de publier » (#85) : vérifier classement, avertissements et tags, voir la carte. */
export function PublishStoryPage() {
  const { storyId = '' } = useParams();
  const story = useStory(storyId);
  const me = useMyAccount();
  if (story.isPending || me.isPending) return <Loading label="Chargement de l’histoire…" />;
  const handle = me.data?.handle;
  const mine =
    !!story.data && !!handle && handleKey(story.data.author.handle) === handleKey(handle);
  // Données en cache : un rechargement en échec ne fait pas perdre la saisie.
  if (!story.data || !mine) {
    return (
      <Page title="Histoire introuvable" width="narrow">
        {story.isError && !story.data && (
          <Alert tone="danger" title="Cette histoire n’a pas pu être chargée.">
            <p>{story.error.message}</p>
          </Alert>
        )}
      </Page>
    );
  }
  return <PublishForm story={story.data} />;
}

function PublishForm({ story }: { story: StoryDetail }) {
  const actions = useWriterActions(story.id);
  const formRef = useRef<HTMLFormElement>(null);
  const done = useRef<HTMLDivElement>(null);
  // Garde synchrone : un double clic n'envoie qu'une fois.
  const sending = useRef(false);
  const [preview, setPreview] = useState<Preview>({
    rating: story.rating,
    majorWarnings: story.majorWarnings,
    contentWarnings: story.contentWarnings,
    tags: story.tags,
  });
  const [errors, setErrors] = useState<Errors>({});
  const [tried, setTried] = useState(false);
  const [published, setPublished] = useState(false);

  const publishedChapters = story.chapters.filter((c) => c.status === 'published').length;
  const missing = missingItems(preview, publishedChapters);
  const ready = missing.length === 0;
  const pending = actions.updateStory.isPending || actions.publishStory.isPending;
  const back = `/ecrire/histoires/${story.id}`;

  // Après la publication, le formulaire disparaît : le focus va au message (WCAG 2.4.3).
  useEffect(() => {
    if (published) done.current?.focus();
  }, [published]);

  const update = () => {
    if (formRef.current) setPreview(readPreview(formRef.current));
    // Nouvelle saisie : les anciens messages d'échec ne sont plus vrais.
    if (actions.updateStory.isError) actions.updateStory.reset();
    if (actions.publishStory.isError) actions.publishStory.reset();
  };

  const publish = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sending.current) return;
    const form = event.currentTarget;
    setTried(true);
    const read = readStoryForm(form, story);
    const next: Errors = { ...read.errors };
    if (!preview.rating) next.rating ??= 'Choisissez un classement pour publier.';
    if (readWarnings(new FormData(form)).value === null) {
      next.majorWarnings ??=
        'Cochez les avertissements qui s’appliquent, « aucun avertissement majeur » ou « je préfère ne pas préciser ».';
    }
    setErrors(next);
    if (Object.keys(next).length) {
      focusFirstError(form);
      return;
    }
    if (!ready || !read.values) return;
    // Seulement ce que cette page montre : un titre modifié ailleurs n'est pas écrasé.
    const { rating, majorWarnings, contentWarnings, tags } = read.values;
    const values: UpdateStory = { rating, majorWarnings, contentWarnings, tags };
    sending.current = true;
    try {
      await actions.updateStory.mutateAsync(values);
      await actions.publishStory.mutateAsync();
      setPublished(true);
    } catch {
      // Message affiché depuis l'état des mutations.
    } finally {
      sending.current = false;
    }
  };

  if (published || story.status === 'published') {
    return (
      <Page
        title={published ? 'Votre histoire est publiée' : 'Histoire déjà publiée'}
        width="narrow"
      >
        <div ref={done} tabIndex={-1} className={styles.done}>
          <Alert tone="success" live={published} title={`« ${story.title} » est en ligne.`}>
            <p>
              Elle apparaît dans Explorer. Vous pourrez modifier ses informations ou la repasser en
              brouillon à tout moment.
            </p>
          </Alert>
        </div>
        <div className={styles.links}>
          <ButtonLink to={`/histoires/${story.id}`} variant="primary">
            Voir comme une lectrice ou un lecteur
          </ButtonLink>
          <ButtonLink to={back} variant="ghost">
            Retour à l’histoire
          </ButtonLink>
        </div>
      </Page>
    );
  }

  return (
    <Page title="Avant de publier" documentTitle={`Publier « ${story.title} »`} lead={story.title}>
      <div className={styles.layout}>
        <form
          ref={formRef}
          className={styles.form}
          onSubmit={(e) => void publish(e)}
          onChange={update}
          noValidate
          aria-labelledby="publier-titre"
        >
          <h2 id="publier-titre" className="visually-hidden">
            Classement, avertissements et tags
          </h2>
          <StoryFields story={story} errors={errors} />

          <section className={styles.checklist} aria-labelledby="pour-publier">
            <h2 id="pour-publier" className={styles.sectionTitle}>
              Pour publier
            </h2>
            <ul>
              <li>
                Classement :{' '}
                {preview.rating ? <strong>{ratingLabel[preview.rating]}</strong> : 'à choisir'}
              </li>
              <li>
                Avertissements majeurs :{' '}
                {preview.majorWarnings ? (
                  <strong>{warningsText(preview.majorWarnings)}</strong>
                ) : (
                  'à renseigner'
                )}
              </li>
              <li>
                Chapitres publiés :{' '}
                {publishedChapters ? (
                  <strong>{publishedChapters}</strong>
                ) : (
                  <>
                    aucun pour l’instant (<Link to={back}>publier un chapitre</Link>)
                  </>
                )}
              </li>
            </ul>
            <p id="etat-publication" className={styles.state} aria-live="polite">
              {ready ? 'Tout est prêt.' : `Il manque encore ${missing.join(', ')}.`}
            </p>
          </section>

          {tried && !ready && (
            <Alert tone="danger" live title="L’histoire n’est pas encore publiable.">
              <p>Il manque encore {missing.join(', ')}.</p>
            </Alert>
          )}
          {actions.updateStory.isError && (
            <Alert tone="danger" live title="Les informations n’ont pas été enregistrées.">
              <p>{actions.updateStory.error.message} L’histoire reste un brouillon.</p>
            </Alert>
          )}
          {actions.publishStory.isError && (
            <Alert
              tone="danger"
              live
              title="Informations enregistrées, mais l’histoire n’a pas pu être publiée."
            >
              <p>{actions.publishStory.error.message}</p>
            </Alert>
          )}

          <div className={styles.links}>
            <Button
              type="submit"
              variant="primary"
              pending={pending}
              aria-disabled={!ready || pending || undefined}
              aria-describedby="etat-publication"
            >
              {pending ? 'Publication…' : 'Publier l’histoire'}
            </Button>
            <ButtonLink to={back} variant="ghost">
              Retour à l’histoire
            </ButtonLink>
          </div>
          <p className={styles.note}>
            Vous pourrez modifier ces informations ou repasser l’histoire en brouillon à tout
            moment.
          </p>
        </form>

        <aside className={styles.preview} aria-labelledby="apercu">
          <h2 id="apercu" className={styles.sectionTitle}>
            Aperçu dans Explorer
          </h2>
          <PreviewCard story={story} preview={preview} publishedChapters={publishedChapters} />
        </aside>
      </div>
    </Page>
  );
}

/** La carte telle qu'elle apparaîtra, sans lien (l'histoire n'est pas encore en ligne). */
function PreviewCard({
  story,
  preview,
  publishedChapters,
}: {
  story: StoryDetail;
  preview: Preview;
  publishedChapters: number;
}) {
  const majors = warningsText(preview.majorWarnings);
  const others = contentWarningsText(preview.contentWarnings);
  return (
    <article className={`${reading.card} ${styles.previewCard}`}>
      <div className={reading.spine} style={coverColors(story.id)} aria-hidden="true">
        {story.title}
      </div>
      <div className={reading.cardBody}>
        <h3 className={reading.cardTitle}>{story.title}</h3>
        <p className={reading.meta}>
          par {story.author.displayName ?? `@${story.author.handle}`} ·{' '}
          {plural(publishedChapters, 'chapitre')} · {completionLabel[story.completion]}
        </p>
        {story.summary && <p className={reading.summary}>{story.summary}</p>}
        <ul className={reading.tags} aria-label="Classement, avertissements et tags">
          <li>
            <Tag kind="rating">
              {preview.rating ? ratingLabel[preview.rating] : 'Classement à choisir'}
            </Tag>
          </li>
          {majors === null ? (
            <li>
              <Tag kind="warning">Avertissements : à renseigner</Tag>
            </li>
          ) : preview.majorWarnings?.length ? (
            <li>
              <Tag kind="warning">Avertissements : {majors}</Tag>
            </li>
          ) : null}
          {others && (
            <li>
              <Tag kind="warning">Autres avertissements : {others}</Tag>
            </li>
          )}
          {preview.tags.map((tag) => (
            <li key={tag}>
              <Tag>{tag}</Tag>
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}
