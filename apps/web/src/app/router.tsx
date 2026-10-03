import { createBrowserRouter, Outlet, type RouteObject } from 'react-router';
import { AgeLockedPage } from '../features/account/AgeLockedPage';
import { AcceptCharterPage, CharterPage } from '../features/account/CharterPages';
import { FirstVisitPage } from '../features/account/FirstVisitPage';
import { DesignSystemPage } from '../pages/DesignSystemPage';
import {
  ErrorPage,
  ExplorePage,
  NotFoundPage,
  ReadingsPage,
  RequireAuth,
  SigninCallbackPage,
  WritePage,
} from '../pages/SimplePages';
import { Layout } from './Layout';

const signedIn = (
  <RequireAuth>
    <Outlet />
  </RequireAuth>
);

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      {
        // Une erreur d'affichage garde l'en-tête et la navigation.
        errorElement: <ErrorPage />,
        children: [
          { index: true, element: <ExplorePage /> },
          { path: 'connexion', element: <SigninCallbackPage /> },
          { path: 'charte', element: <CharterPage /> },
          { path: 'design-system', element: <DesignSystemPage /> },
          {
            element: signedIn,
            children: [
              { path: 'bienvenue', element: <FirstVisitPage /> },
              { path: 'charte/accepter', element: <AcceptCharterPage /> },
              { path: 'compte-verrouille', element: <AgeLockedPage /> },
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
