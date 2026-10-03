// Base de données des tests : celle de l'infrastructure de développement (apps/api/.env)
// ou celle de la CI (variables DB_*), avec une base dédiée recréée à chaque lancement.
try {
  process.loadEnvFile('.env');
} catch {
  // Pas de .env (CI) : les variables viennent de l'environnement.
}

export const TEST_DB_NAME = process.env.DB_TEST_NAME ?? 'plumiotheca_test';

export function testDbEnv(): Record<string, string> {
  const pick = (key: string) => (process.env[key] ? { [key]: process.env[key] } : {});
  return {
    ...pick('DB_HOST'),
    ...pick('DB_PORT'),
    ...pick('DB_USERNAME'),
    ...pick('DB_PASSWORD'),
    DB_NAME: TEST_DB_NAME,
    DB_MIGRATE_ON_START: 'false',
    DB_CONNECT_RETRIES: '0',
  };
}
