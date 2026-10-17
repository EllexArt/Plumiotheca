import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Les tests du site tournent depuis apps/web.
const publicFile = (path: string) => readFileSync(`public/${path}`, 'utf8');

describe('robots d’IA (conditions d’utilisation, 4.3)', () => {
  it('robots.txt refuse toute collecte aux robots d’IA connus', () => {
    const robots = publicFile('robots.txt');
    const [ai] = robots.split('User-agent: *');
    for (const bot of ['GPTBot', 'ClaudeBot', 'CCBot', 'Google-Extended', 'Bytespider']) {
      expect(ai).toContain(`User-agent: ${bot}\n`);
    }
    expect(ai).toMatch(/\nDisallow: \/\n/);
  });

  it('réserve de fouille de textes (TDMRep) sur tout le site', () => {
    expect(JSON.parse(publicFile('.well-known/tdmrep.json'))).toEqual([
      { location: '/*', 'tdm-reservation': 1 },
    ]);
  });
});
