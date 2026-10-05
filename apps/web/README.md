# Application web

Une seule application React (Vite, React Router, TanStack Query), qui remplace les anciens micro-frontends (décision 2). Architecture : [docs/architecture.md §6](../../docs/architecture.md).

## Lancer

Depuis la racine du dépôt, avec l'infrastructure démarrée (`pnpm infra:up`) :

```bash
pnpm dev        # API (port 3000) et application web (port 5173)
pnpm dev:web    # application web seule
```

L'application est sur <http://localhost:5173>. En développement, Vite relaie `/api` vers l'API (`API_URL`, par défaut `http://localhost:3000`) : même origine pour le navigateur, pas de CORS.

Comptes de démonstration : `pnpm infra:seed` (mot de passe dans `infra/.env`, variable `DEMO_PASSWORD`).

| Variable              | Défaut                                     | Rôle                                  |
| --------------------- | ------------------------------------------ | ------------------------------------- |
| `VITE_API_URL`        | `/api`                                     | Préfixe de l'API vu par le navigateur |
| `VITE_OIDC_AUTHORITY` | `http://localhost:8080/realms/plumiotheca` | Realm Keycloak                        |
| `VITE_OIDC_CLIENT_ID` | `web`                                      | Client public (PKCE)                  |
| `API_URL`             | `http://localhost:3000`                    | Cible du relais `/api` (dev)          |

## Organisation

```
src/
├── app/        routes, cadre (en-tête, navigation), connexion, thème, garde d'accueil
├── features/   une fonctionnalité par dossier (account : première visite, charte…)
├── pages/      pages simples et système de design
├── shared/     client de l'API, composants d'interface, Markdown
└── styles/     jetons (couleurs, typographie, espacements) et base
```

- **Connexion** : Authorization Code + PKCE (`react-oidc-context`) ; jeton gardé dans la session de l'onglet, renouvelé en arrière-plan ; un 401 tente un renouvellement silencieux avant de renvoyer à la connexion.
- **API** : `shared/api` ; chaque réponse est vérifiée par le schéma de `@plumiotheca/contracts`, les erreurs suivent le format RFC 9457 de l'API.
- **Accueil** : une personne connectée qui n'a pas choisi son pseudonyme, déclaré son âge ou accepté la charte y est conduite avant toute autre page.
- **Styles** : CSS Modules et variables (`styles/tokens.css`), palette Lueur en clair et en sombre ; polices auto-hébergées (aucune requête vers un service tiers).

## Accessibilité

Partie de la définition de « terminé » (RGAA 4, WCAG 2.2 AA) :

- `pnpm lint` applique `jsx-a11y` en mode strict ;
- les tests passent chaque page par **axe-core** et vérifient les **contrastes** de tous les jetons dans les deux thèmes (`src/styles/contrast.test.ts`) ;
- la page `/design-system` montre chaque composant pour une vérification manuelle (clavier, lecteur d'écran, zoom à 200 %).

## Tests

```bash
pnpm --filter @plumiotheca/web test
```
