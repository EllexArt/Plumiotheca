import { useEditorState, type Editor } from '@tiptap/react';
import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import styles from './ChapterEditor.module.css';

interface Tool {
  label: string;
  /** Raccourci annoncé (aria-keyshortcuts) et rappelé dans l'infobulle. */
  keys?: string;
  glyph: ReactNode;
  run: (editor: Editor) => void;
  active?: (editor: Editor) => boolean;
  /** Commencer un nouveau groupe (séparateur visuel). */
  group?: boolean;
}

/** Touche des raccourcis : Cmd sur les appareils Apple, Ctrl ailleurs (« Mod » de TipTap). */
export const MOD =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
    ? 'Meta'
    : 'Control';
const modName = MOD === 'Meta' ? 'Cmd' : 'Ctrl';

const tools: Tool[] = [
  {
    label: 'Texte courant',
    glyph: '¶',
    run: (e) => e.chain().focus().setParagraph().run(),
    active: (e) => e.isActive('paragraph'),
  },
  {
    label: 'Intertitre',
    keys: MOD + '+Alt+2',
    glyph: 'T',
    run: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(),
    active: (e) => e.isActive('heading', { level: 2 }),
  },
  {
    label: 'Sous-intertitre',
    keys: MOD + '+Alt+3',
    glyph: 't',
    run: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(),
    active: (e) => e.isActive('heading', { level: 3 }),
  },
  {
    label: 'Gras',
    keys: MOD + '+B',
    glyph: <strong>G</strong>,
    run: (e) => e.chain().focus().toggleBold().run(),
    active: (e) => e.isActive('bold'),
    group: true,
  },
  {
    label: 'Italique',
    keys: MOD + '+I',
    glyph: <em>I</em>,
    run: (e) => e.chain().focus().toggleItalic().run(),
    active: (e) => e.isActive('italic'),
  },
  {
    label: 'Souligné',
    keys: MOD + '+U',
    glyph: <u>S</u>,
    run: (e) => e.chain().focus().toggleUnderline().run(),
    active: (e) => e.isActive('underline'),
  },
  {
    label: 'Barré',
    keys: MOD + '+Shift+S',
    glyph: <s>B</s>,
    run: (e) => e.chain().focus().toggleStrike().run(),
    active: (e) => e.isActive('strike'),
  },
  {
    label: 'Citation',
    keys: MOD + '+Shift+B',
    glyph: '«',
    run: (e) => e.chain().focus().toggleBlockquote().run(),
    active: (e) => e.isActive('blockquote'),
    group: true,
  },
  {
    label: 'Liste à puces',
    keys: MOD + '+Shift+8',
    glyph: '•',
    run: (e) => e.chain().focus().toggleBulletList().run(),
    active: (e) => e.isActive('bulletList'),
  },
  {
    label: 'Liste numérotée',
    keys: MOD + '+Shift+7',
    glyph: '1.',
    run: (e) => e.chain().focus().toggleOrderedList().run(),
    active: (e) => e.isActive('orderedList'),
  },
  {
    label: 'Changement de scène',
    glyph: '⁂',
    run: (e) => e.chain().focus().setHorizontalRule().run(),
  },
  {
    label: 'Annuler',
    keys: MOD + '+Z',
    glyph: '↶',
    run: (e) => e.chain().focus().undo().run(),
    group: true,
  },
  {
    label: 'Rétablir',
    keys: MOD + '+Shift+Z',
    glyph: '↷',
    run: (e) => e.chain().focus().redo().run(),
  },
];

/**
 * Barre de mise en forme (motif « toolbar » de l'APG) : un seul arrêt de tabulation, les
 * flèches pour passer d'un bouton à l'autre ; chaque bouton dit son nom, son raccourci
 * et s'il est actif (aria-pressed).
 */
export function Toolbar({ editor }: { editor: Editor }) {
  const [current, setCurrent] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => tools.map((tool) => tool.active?.(e) ?? null),
  });

  const move = (event: KeyboardEvent) => {
    const last = tools.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? current === last
          ? 0
          : current + 1
        : event.key === 'ArrowLeft'
          ? current === 0
            ? last
            : current - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    setCurrent(next);
    buttons.current[next]?.focus();
  };

  return (
    <div role="toolbar" aria-label="Mise en forme" className={styles.toolbar} onKeyDown={move}>
      {tools.map((tool, i) => {
        const pressed = state[i];
        return (
          <span key={tool.label} className={tool.group ? styles.groupStart : undefined}>
            <button
              ref={(el) => {
                buttons.current[i] = el;
              }}
              type="button"
              className={styles.tool}
              tabIndex={i === current ? 0 : -1}
              aria-label={tool.label}
              aria-pressed={pressed === null ? undefined : pressed}
              aria-keyshortcuts={tool.keys}
              title={tool.keys ? `${tool.label} (${tool.keys.replace(MOD, modName)})` : tool.label}
              onClick={() => {
                setCurrent(i);
                tool.run(editor);
              }}
            >
              <span aria-hidden="true">{tool.glyph}</span>
            </button>
          </span>
        );
      })}
    </div>
  );
}
