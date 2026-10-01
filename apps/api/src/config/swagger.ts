import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Plumiotheca API',
            version: '1.0.0',
            description: 'API pour la plateforme Plumiotheca, permettant de lire et partager des histoires (inspiré de Wattpad).',
        },
        servers: [
            {
                url: 'http://localhost:3000',
                description: 'Serveur de développement local',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
        },
        tags: [
            {
                name: 'Users',
                description: 'Gestion des profils utilisateurs et synchronisation Keycloak',
            },
            {
                name: 'Stories',
                description: 'Gestion des histoires (livres), recherche et statistiques',
            },
            {
                name: 'Chapters',
                description: 'Gestion des chapitres au sein des histoires',
            },
        ],
    },
    apis: [
        './src/routes/*.ts', 
        './src/entities/*.ts', 
        './dist/routes/*.js', 
        './dist/entities/*.js'
    ], // Chemin vers les fichiers contenant les annotations
};

export const swaggerSpec = swaggerJsdoc(options);
