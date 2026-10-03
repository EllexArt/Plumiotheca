import type { ComponentType } from 'react';
import { createBrowserRouter, Outlet, type RouteObject } from 'react-router';
import {
  ErrorPage,
  ExplorePage,
  NotFoundPage,
  ReadingsPage,
  RequireAuth,
  SigninCallbackPage,
  WritePage,
} from '../pages/SimplePages';
import { Loading } from '../shared/ui/Feedback';
import { Layout } from './Layout';

const signedIn = (
  <RequireAuth>
    <Outlet />
  </RequireAuth>
);

// Chargement à la demande (architecture §6) : chaque page ci-dessous est un fichier à part,
// téléchargé seulement quand on l'ouvre (l'accueil et la charte, avec son texte, ne
// pèsent que sur les personnes qui y passent).
const account = () => import('../features/account/pages');
const lazyPage =
  <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  async () => ({ Component: (await load())[name] });

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    hydrateFallbackElement: <Loading />,
    children: [
      {
        // Une erreur d'affichage garde l'en-tête et la navigation.
        errorElement: <ErrorPage />,
        children: [
          { index: true, element: <ExplorePage /> },
          { path: 'connexion', element: <SigninCallbackPage /> },
          { path: 'charte', lazy: lazyPage(account, 'CharterPage') },
          {
            path: 'design-system',
            lazy: lazyPage(() => import('../pages/DesignSystemPage'), 'DesignSystemPage'),
          },
          {
            element: signedIn,
            children: [
              { path: 'bienvenue', lazy: lazyPage(account, 'FirstVisitPage') },
              { path: 'charte/accepter', lazy: lazyPage(account, 'AcceptCharterPage') },
              { path: 'compte-verrouille', lazy: lazyPage(account, 'AgeLockedPage') },
              { path: 'mes-lectures', element: <ReadingsPage /> },
              { path: 'ecrire', element: <WritePage /> },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];

export const router = createBrowserRouter(routes);
