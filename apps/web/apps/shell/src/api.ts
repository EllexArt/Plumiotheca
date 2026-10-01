import { createApiClient } from '@plumiotheca/api-client';
import type { ApiClient } from '@plumiotheca/api-client';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

/**
 * The shell is the only app that knows about Keycloak, so it is the one that
 * builds the API client and passes it down to the remotes.
 */
export function createApi(getToken: () => string | undefined): ApiClient {
    return createApiClient({ baseUrl: API_URL, getToken });
}
