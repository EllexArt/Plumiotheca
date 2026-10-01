import express, { Response } from 'express';
import { UserService } from '../services/user.service';

const router = express.Router();

/**
 * @openapi
 * /api/users/profile:
 *   get:
 *     summary: Récupère le profil de l'utilisateur connecté
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Profil récupéré avec succès
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Non authentifié
 */
// GET current user profile
router.get('/profile', async (req: any, res: Response) => {
    if (!req.user) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }
    res.json(req.user);
});

/**
 * @openapi
 * /api/users/profile:
 *   patch:
 *     summary: Met à jour le profil de l'utilisateur connecté
 *     tags:
 *       - Users
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               displayName:
 *                 type: string
 *               bio:
 *                 type: string
 *               avatarUrl:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profil mis à jour
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       401:
 *         description: Non authentifié
 */
// UPDATE current user profile
router.patch('/profile', async (req: any, res: Response) => {
    if (!req.user) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }

    try {
        const { displayName, bio, avatarUrl } = req.body;
        const updatedUser = await UserService.updateProfile(req.user, { displayName, bio, avatarUrl });
        res.json(updatedUser);
    } catch (error) {
        res.status(500).json({ message: 'Error updating profile', error });
    }
});

/**
 * @openapi
 * /api/users/{username}:
 *   get:
 *     summary: Récupère un profil utilisateur public par son username
 *     tags:
 *       - Users
 *     parameters:
 *       - in: path
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Profil trouvé
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       404:
 *         description: Utilisateur non trouvé
 */
// GET profile by username (public)
router.get('/:username', async (req: any, res: Response) => {
    try {
        const user = await UserService.getUserByUsername(req.params.username);
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching user', error });
    }
});

export default router;