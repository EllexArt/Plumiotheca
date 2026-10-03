import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Contrastes WCAG 2.2 AA (RGAA 3.2 et 3.3) des jetons de couleur, pour chaque thème.
// Chemin relatif à apps/web (racine de Vitest).
const css = readFileSync('src/styles/tokens.css', 'utf8');

function block(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`Bloc ${selector} introuvable`);
  const body = css.slice(start, css.indexOf('\n}', start));
  const colors = Object.fromEntries(
    [...body.matchAll(/--(color-[\w-]+):\s*(#[0-9a-f]{6})\s*;/gi)].map((m) => [m[1]!, m[2]!]),
  );
  // Toute couleur doit être lue : une valeur écrite autrement (#abc, rgb()…) serait sinon
  // ignorée en silence, et le thème sombre testé avec la valeur claire.
  const declared = [...body.matchAll(/--(color-[\w-]+):/g)].map((m) => m[1]!);
  const unread = declared.filter((name) => !(name in colors));
  if (unread.length)
    throw new Error(`${selector} : couleurs à écrire en #rrggbb : ${unread.join(', ')}`);
  return colors;
}

const light = block(':root');
const themes = { clair: light, sombre: { ...light, ...block(":root[data-theme='dark']") } };

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const backgrounds = ['page', 'surface', 'raised'];
/** Texte courant : 4,5:1 sur tous les fonds. */
const texts = ['text', 'text-soft', 'text-muted', 'reading', 'accent', 'accent-hover', 'danger'];
/** Couples texte / fond propres à un composant. */
const pairs: [string, string][] = [
  ['on-primary', 'primary'],
  ['on-primary', 'primary-hover'],
  ['on-amber', 'amber'],
  ['success', 'success-bg'],
  ['warning', 'warning-bg'],
  ['danger', 'danger-bg'],
  ['text', 'highlight'],
  ['text', 'sunken'],
  ['text-soft', 'sunken'],
  ['success', 'page'], // « pseudonyme disponible »
  ['page', 'success'], // initiales dans l'avatar du compte
];
/** Éléments d'interface (contour des champs, focus) : 3:1 (WCAG 1.4.11). */
const ui = ['control-border', 'focus'];

describe.each(Object.entries(themes))('thème %s', (_, colors) => {
  const c = (name: string) => {
    const value = colors[`color-${name}`];
    if (!value) throw new Error(`--color-${name} manquant`);
    return value;
  };

  it.each(texts.flatMap((t) => backgrounds.map((bg) => [t, bg])))('%s sur %s : 4,5:1', (t, bg) => {
    expect(contrast(c(t), c(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(pairs)('%s sur %s : 4,5:1', (t, bg) => {
    expect(contrast(c(t), c(bg))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(ui.flatMap((u) => backgrounds.map((bg) => [u, bg])))('%s sur %s : 3:1', (u, bg) => {
    expect(contrast(c(u), c(bg))).toBeGreaterThanOrEqual(3);
  });
});
