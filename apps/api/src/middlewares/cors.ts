import { Request, Response, NextFunction } from 'express';

const DEFAULT_ORIGINS = [
  'http://localhost:5000', // shell
  'http://localhost:5001', // reader
  'http://localhost:5002', // editor
];

const allowedOrigins = (process.env.CORS_ORIGINS || DEFAULT_ORIGINS.join(','))
  .split(',')
  .map((origin) => origin.trim())
  .filter((origin) => origin.length > 0);

/**
 * Allows the micro-frontends to call the API from their own origin.
 * Preflight requests are answered here, before Keycloak runs: a browser
 * never sends the Authorization header on an OPTIONS request.
 */
export const corsMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const origin = req.headers.origin;

  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Vary', 'Origin');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Authorization,Content-Type');
    res.header('Access-Control-Max-Age', '600');
  }

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }

  next();
};
