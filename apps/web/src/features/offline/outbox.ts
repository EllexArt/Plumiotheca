import { MAX_READING_SECONDS, type ReadingPosition } from '@plumiotheca/contracts';

/**
 * Lectures faites hors ligne (#35), en attente d'envoi : la dernière position par histoire
 * et le temps de lecture. Rattachées au compte qui lisait : jamais envoyées au nom d'un
 * autre (appareil partagé). Effacées une fois envoyées, ou à la déconnexion.
 */
const KEY = 'plumiotheca.envois';

export interface Outbox {
  /** Compte qui lisait (identifiant Keycloak, déjà sur l'appareil avec la session). */
  account: string;
  positions: Record<string, Required<ReadingPosition>>;
  seconds: number;
}

function read(): Outbox | null {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Outbox | null;
    return value && typeof value.account === 'string' ? value : null;
  } catch {
    return null;
  }
}

function write(outbox: Outbox | null) {
  try {
    if (!outbox || (!Object.keys(outbox.positions).length && !outbox.seconds)) {
      localStorage.removeItem(KEY);
    } else {
      localStorage.setItem(KEY, JSON.stringify(outbox));
    }
  } catch {
    // Stockage indisponible : la lecture hors ligne ne sera pas reportée.
  }
}

/** File de ce compte (une file d'un autre compte est laissée de côté, intacte). */
function mine(account: string): Outbox | null {
  const outbox = read();
  if (outbox && outbox.account !== account) return null;
  return outbox ?? { account, positions: {}, seconds: 0 };
}

export function queuePosition(account: string, storyId: string, position: ReadingPosition) {
  const outbox = mine(account);
  if (!outbox) return;
  outbox.positions[storyId] = {
    ...position,
    readAt: position.readAt ?? new Date().toISOString(),
  };
  write(outbox);
}

export function queueSeconds(account: string, seconds: number) {
  const outbox = mine(account);
  if (!outbox) return;
  outbox.seconds += seconds;
  write(outbox);
}

export const pendingFor = (account: string): Outbox | null => {
  const outbox = read();
  return outbox?.account === account ? outbox : null;
};

/** Retire ce qui a été envoyé (ou refusé pour de bon). */
export function settle(account: string, done: { storyId?: string; seconds?: number }) {
  const outbox = pendingFor(account);
  if (!outbox) return;
  if (done.storyId) delete outbox.positions[done.storyId];
  if (done.seconds) outbox.seconds = Math.max(0, outbox.seconds - done.seconds);
  write(outbox);
}

export const forgetOutbox = () => write(null);

/** Tranches de temps à envoyer (une heure au plus chacune). */
export function chunks(seconds: number): number[] {
  const out: number[] = [];
  for (let left = Math.floor(seconds); left > 0; left -= MAX_READING_SECONDS) {
    out.push(Math.min(left, MAX_READING_SECONDS));
  }
  return out;
}
