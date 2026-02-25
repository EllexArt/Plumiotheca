import { Response, NextFunction } from 'express';
import { UserService } from '../services/user.service';

export const authMiddleware = async (req: any, res: Response, next: NextFunction) => {
    if (req.kauth && req.kauth.grant) {
        try {
            const tokenContent = req.kauth.grant.access_token.content;
            req.user = await UserService.syncUserFromToken(tokenContent);
        } catch (error) {
            console.error('Error during user synchronization:', error);
        }
    }
    next();
};
