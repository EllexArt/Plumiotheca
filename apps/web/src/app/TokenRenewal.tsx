import { useEffect } from 'react';
import { useAuth } from 'react-oidc-context';
import { renewOnce } from '../shared/api/useApi';

/**
 * Renouvelle le jeton peu avant son expiration (événement d'oidc-client-ts), par le même
 * renouvellement partagé que useApi après un refus : jamais deux renouvellements en même
 * temps, qui consommeraient deux fois le jeton de rafraîchissement (à usage unique).
 */
export function TokenRenewal() {
  const auth = useAuth();
  const events = auth.events;
  const signinSilent = auth.signinSilent;

  useEffect(() => {
    // Absent du faux module d'authentification des tests.
    if (!events) return;
    return events.addAccessTokenExpiring(() => {
      void renewOnce(() => signinSilent());
    });
  }, [events, signinSilent]);

  return null;
}
