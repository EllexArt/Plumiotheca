import { useEffect, type RefObject } from 'react';
import { rememberBlock } from './progress';

/** Hauteur à partir de laquelle un paragraphe compte comme « en cours » (sous l'en-tête). */
const TOP = 96;

/**
 * Retient le paragraphe en cours de lecture (#29) : le premier dont le bas est encore sous
 * l'en-tête. Écrit au plus une fois par demi-seconde, et au départ de la page.
 */
export function useTrackPosition(
  container: RefObject<HTMLElement | null>,
  storyId: string,
  chapterId: string,
  enabled: boolean,
) {
  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: string | null = null;
    let saved: string | null = null;

    const flush = () => {
      timer = undefined;
      if (current && current !== saved) {
        rememberBlock(storyId, chapterId, current);
        saved = current;
      }
    };
    const measure = () => {
      frame = 0;
      const blocks = container.current?.querySelectorAll<HTMLElement>('[id^="b-"]') ?? [];
      const reading = [...blocks].find((b) => b.getBoundingClientRect().bottom > TOP);
      const id = reading?.id.slice(2) ?? null;
      // En haut du chapitre : rien à retenir de plus que le chapitre lui-même.
      if (!id || id === current || window.scrollY < TOP) return;
      current = id;
      timer ??= setTimeout(flush, 500);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (frame) cancelAnimationFrame(frame);
      if (timer) clearTimeout(timer);
      flush();
    };
  }, [container, storyId, chapterId, enabled]);
}

/**
 * Ramène au paragraphe `blockId` (#29) et y place le focus : un lecteur d'écran reprend
 * la lecture à cet endroit. Après la mise en page, qui remonte en haut à chaque page.
 */
export function useResume(blockId: string | null | undefined, ready: boolean) {
  useEffect(() => {
    if (!ready || !blockId) return;
    const frame = requestAnimationFrame(() => {
      const block = document.getElementById(`b-${blockId}`);
      // Paragraphe disparu (chapitre réécrit depuis) : on reste au début du chapitre.
      if (!block) return;
      block.setAttribute('tabindex', '-1');
      block.scrollIntoView({ block: 'start' });
      block.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [blockId, ready]);
}
