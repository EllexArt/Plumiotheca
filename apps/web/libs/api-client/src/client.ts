import type {
    Chapter,
    ChapterInput,
    ProfileInput,
    Story,
    StoryInput,
    User
} from './types';

export class ApiError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
        this.name = 'ApiError';
    }

    /** True when the call failed because nobody is logged in. */
    get isUnauthorized(): boolean {
        return this.status === 401 || this.status === 403;
    }
}

export interface ApiClientOptions {
    /** Base URL of the backend, e.g. http://localhost:3000 */
    baseUrl: string;
    /** Returns the current Keycloak access token, or undefined when logged out. */
    getToken?: () => string | undefined;
}

/**
 * Creates the client used by every micro-frontend to reach the API.
 * The shell owns authentication, so it builds the client and hands it
 * down to the remotes as a prop.
 */
export function createApiClient({ baseUrl, getToken }: ApiClientOptions) {
    const root = baseUrl.replace(/\/$/, '');

    async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
        const headers: Record<string, string> = { ...(init.headers as Record<string, string>) };

        if (init.body) {
            headers['Content-Type'] = 'application/json';
        }

        const token = getToken?.();
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        let response: Response;
        try {
            response = await fetch(`${root}${path}`, { ...init, headers });
        } catch {
            throw new ApiError(0, `Unable to reach the API at ${root}. Is the backend running?`);
        }

        if (!response.ok) {
            throw new ApiError(response.status, await readErrorMessage(response));
        }

        if (response.status === 204) {
            return undefined as T;
        }

        return (await response.json()) as T;
    }

    async function readErrorMessage(response: Response): Promise<string> {
        try {
            const body = await response.json();
            if (body && typeof body.message === 'string') {
                return body.message;
            }
        } catch {
            // Body was empty or not JSON, fall back to the status text.
        }
        return response.statusText || `Request failed with status ${response.status}`;
    }

    return {
        stories: {
            /**
             * Lists stories. The API returns published stories only unless
             * `published` is explicitly set to false, which returns every story.
             */
            list(options: { published?: boolean; tag?: string } = {}): Promise<Story[]> {
                const params = new URLSearchParams();
                if (options.published === false) {
                    params.set('published', 'false');
                }
                if (options.tag) {
                    params.set('tag', options.tag);
                }
                const query = params.toString();
                return request<Story[]>(`/api/stories${query ? `?${query}` : ''}`);
            },

            get(id: number): Promise<Story> {
                return request<Story>(`/api/stories/${id}`);
            },

            create(input: StoryInput): Promise<Story> {
                return request<Story>('/api/stories', {
                    method: 'POST',
                    body: JSON.stringify(input)
                });
            },

            update(id: number, input: Partial<StoryInput>): Promise<Story> {
                return request<Story>(`/api/stories/${id}`, {
                    method: 'PATCH',
                    body: JSON.stringify(input)
                });
            },

            remove(id: number): Promise<void> {
                return request<void>(`/api/stories/${id}`, { method: 'DELETE' });
            },

            listChapters(storyId: number): Promise<Chapter[]> {
                return request<Chapter[]>(`/api/stories/${storyId}/chapters`);
            },

            createChapter(storyId: number, input: ChapterInput): Promise<Chapter> {
                return request<Chapter>(`/api/stories/${storyId}/chapters`, {
                    method: 'POST',
                    body: JSON.stringify(input)
                });
            }
        },

        users: {
            getProfile(): Promise<User> {
                return request<User>('/api/users/profile');
            },

            updateProfile(input: ProfileInput): Promise<User> {
                return request<User>('/api/users/profile', {
                    method: 'PATCH',
                    body: JSON.stringify(input)
                });
            },

            getByUsername(username: string): Promise<User> {
                return request<User>(`/api/users/${username}`);
            }
        }
    };
}

export type ApiClient = ReturnType<typeof createApiClient>;

/**
 * Error helpers are duck-typed on purpose: each micro-frontend bundles its own
 * copy of this module, so an `instanceof ApiError` check would fail on an error
 * thrown by the client the shell created. Reading the shape always works.
 */
export function isApiError(error: unknown): error is ApiError {
    return (
        typeof error === 'object' &&
        error !== null &&
        'status' in error &&
        typeof (error as { status: unknown }).status === 'number'
    );
}

export function isUnauthorizedError(error: unknown): boolean {
    return isApiError(error) && (error.status === 401 || error.status === 403);
}

export function getErrorMessage(error: unknown): string {
    if (isApiError(error) || error instanceof Error) {
        return error.message;
    }
    return 'Unexpected error';
}
