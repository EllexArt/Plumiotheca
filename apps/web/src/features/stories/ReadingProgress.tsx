import { useEffect, useState, type RefObject } from 'react';
import styles from './Reading.module.css';

/**
 * Progression dans le chapitre (#23) : barre fine en bas de l'écran, élément <progress>
 * natif (valeur lisible par les lecteurs d'écran, sans annonce à chaque défilement).
 */
export function ReadingProgress({ target }: { target: RefObject<HTMLElement | null> }) {
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      frame = 0;
      const element = target.current;
      if (!element) return;
      const { top, height } = element.getBoundingClientRect();
      const read = window.innerHeight - top;
      setPercent(height > 0 ? Math.round(Math.min(Math.max(read / height, 0), 1) * 100) : 0);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [target]);

  return (
    <progress
      className={styles.progress}
      max={100}
      value={percent}
      aria-label="Progression dans le chapitre"
      aria-valuetext={`${percent} % du chapitre`}
    />
  );
}
