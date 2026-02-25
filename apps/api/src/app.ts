import express, { Request, Response } from 'express';
import session from 'express-session';
import Keycloak from 'keycloak-connect';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './config/swagger';
import { authMiddleware } from './middlewares/auth';
import userRouter from './routes/users';
import storyRouter from './routes/stories';

const app = express();

// Session configuration
const memoryStore = new session.MemoryStore();
app.use(session({
    secret: 'some secret',
    resave: false,
    saveUninitialized: true,
    store: memoryStore
}));

// Keycloak configuration
const keycloakConfig = {
    realm: process.env.KEYCLOAK_REALM || 'plumiotheca',
    'auth-server-url': process.env.KEYCLOAK_AUTH_SERVER_URL || 'http://localhost:8080',
    'ssl-required': 'external',
    resource: process.env.KEYCLOAK_CLIENT_ID || 'plumiotheca-backend',
    'public-client': true,
    'confidential-port': 0
};

const keycloak = new Keycloak({ store: memoryStore }, keycloakConfig as any);

app.use(express.json());

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use(keycloak.middleware());
app.use(authMiddleware);

// Routes
app.use('/api/users', userRouter);
app.use('/api/stories', storyRouter);

app.get('/', (req: Request, res: Response) => {
    res.send('Hello World!');
});

// Example of a protected route
app.get('/protected', keycloak.protect(), (req: any, res: Response) => {
    res.json({ 
        message: 'This is a protected route',
        user: req.user
    });
});

export default app;