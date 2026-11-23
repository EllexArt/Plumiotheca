// Base de données des tests : celle de l'infrastructure de développement (apps/api/.env)
// ou celle de la CI (variables DB_*), avec une base dédiée recréée à chaque lancement.
try {
  process.loadEnvFile('.env');
} catch {
  // Pas de .env (CI) : les variables viennent de l'environnement.
}

/** Plusieurs lancements en parallèle (arbres de travail…) : un DB_TEST_NAME chacun. */
export const TEST_DB_NAME = process.env.DB_TEST_NAME ?? 'plumiotheca_test';
// La base de test est supprimée à chaque lancement : jamais une autre base par erreur.
if (!TEST_DB_NAME.endsWith('_test')) {
  throw new Error(`DB_TEST_NAME doit finir par « _test » (reçu : ${TEST_DB_NAME})`);
}

/** Index des tests de réindexation complète, à part : l'échange d'index ne gêne personne. */
export const REINDEX_TEST_INDEX = `${TEST_DB_NAME}_reindexation`;

export function testDbEnv(): Record<string, string> {
  const pick = (key: string) => (process.env[key] ? { [key]: process.env[key] } : {});
  return {
    ...pick('DB_HOST'),
    ...pick('DB_PORT'),
    ...pick('DB_USERNAME'),
    ...pick('DB_PASSWORD'),
    ...pick('MEILI_URL'),
    ...pick('MEILI_MASTER_KEY'),
    // Index de recherche propre aux tests, vidé à chaque lancement.
    SEARCH_INDEX: TEST_DB_NAME,
    DB_NAME: TEST_DB_NAME,
    DB_MIGRATE_ON_START: 'false',
    DB_CONNECT_RETRIES: '0',
  };
}
