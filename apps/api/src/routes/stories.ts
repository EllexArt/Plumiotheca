import express, { Response } from 'express';
import { StoryService } from '../services/story.service';
import { ChapterService } from '../services/chapter.service';

const router = express.Router();

/**
 * @openapi
 * /api/stories:
 *   get:
 *     summary: Récupère toutes les histoires (public)
 *     tags:
 *       - Stories
 *     parameters:
 *       - in: query
 *         name: published
 *         schema:
 *           type: boolean
 *           default: true
 *         description: Filtrer par statut publié
 *       - in: query
 *         name: tag
 *         schema:
 *           type: string
 *         description: Filtrer par tag
 *     responses:
 *       200:
 *         description: Liste des histoires
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Story'
 */
// GET all stories (public)
router.get('/', async (req, res: Response) => {
    try {
        const stories = await StoryService.getAllStories({ 
            publishedOnly: req.query.published !== 'false',
            tag: req.query.tag as string
        });
        res.json(stories);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching stories', error });
    }
});

/**
 * @openapi
 * /api/stories/{id}:
 *   get:
 *     summary: Récupère une histoire spécifique (public)
 *     tags:
 *       - Stories
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Détails de l'histoire
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Story'
 *       404:
 *         description: Histoire non trouvée
 */
// GET one story (public)
router.get('/:id', async (req, res: Response) => {
    try {
        const story = await StoryService.getStoryById(parseInt(req.params.id));
        if (!story) {
            res.status(404).json({ message: 'Story not found' });
            return;
        }
        await StoryService.incrementViews(story.id);
        res.json(story);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching story', error });
    }
});

/**
 * @openapi
 * /api/stories:
 *   post:
 *     summary: Crée une nouvelle histoire (protégé)
 *     tags:
 *       - Stories
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title]
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               coverUrl:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [draft, published]
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Histoire créée
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Story'
 */
// CREATE story (protected)
router.post('/', async (req: any, res: Response) => {
    if (!req.user) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }
    try {
        const { tags, ...storyData } = req.body;
        const story = await StoryService.createStory(req.user, storyData, tags);
        res.status(201).json(story);
    } catch (error) {
        res.status(500).json({ message: 'Error creating story', error });
    }
});

/**
 * @openapi
 * /api/stories/{id}:
 *   patch:
 *     summary: Met à jour une histoire (protégé)
 *     tags:
 *       - Stories
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Story'
 *     responses:
 *       200:
 *         description: Histoire mise à jour
 *       403:
 *         description: Non autorisé
 */
// UPDATE story (protected)
router.patch('/:id', async (req: any, res: Response) => {
    if (!req.user) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }
    try {
        const { tags, ...storyData } = req.body;
        const updatedStory = await StoryService.updateStory(parseInt(req.params.id), req.user.id, storyData, tags);
        if (!updatedStory) {
            res.status(404).json({ message: 'Story not found or unauthorized' });
            return;
        }
        res.json(updatedStory);
    } catch (error) {
        res.status(500).json({ message: 'Error updating story', error });
    }
});

/**
 * @openapi
 * /api/stories/{id}:
 *   delete:
 *     summary: Supprime une histoire (protégé)
 *     tags:
 *       - Stories
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       204:
 *         description: Histoire supprimée
 *       403:
 *         description: Non autorisé
 */
// DELETE story (protected)
router.delete('/:id', async (req: any, res: Response) => {
    if (!req.user) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }
    try {
        const deleted = await StoryService.deleteStory(parseInt(req.params.id), req.user.id);
        if (!deleted) {
            res.status(404).json({ message: 'Story not found or unauthorized' });
            return;
        }
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: 'Error deleting story', error });
    }
});

// CHAPTERS ROUTES

/**
 * @openapi
 * /api/stories/{id}/chapters:
 *   get:
 *     summary: Récupère les chapitres d'une histoire
 *     tags:
 *       - Chapters
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Liste des chapitres
 */
// GET chapters for a story
router.get('/:id/chapters', async (req, res: Response) => {
    try {
        const chapters = await ChapterService.getChaptersByStory(parseInt(req.params.id));
        res.json(chapters);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching chapters', error });
    }
});

/**
 * @openapi
 * /api/stories/{id}/chapters:
 *   post:
 *     summary: Ajoute un chapitre à une histoire (protégé)
 *     tags:
 *       - Chapters
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, content, order]
 *             properties:
 *               title: { type: string }
 *               content: { type: string }
 *               order: { type: integer }
 *     responses:
 *       201:
 *         description: Chapitre créé
 */
// ADD chapter to story
router.post('/:id/chapters', async (req: any, res: Response) => {
    if (!req.user) {
        res.status(401).json({ message: 'Unauthorized' });
        return;
    }
    try {
        const chapter = await ChapterService.addChapter(parseInt(req.params.id), req.user.id, req.body);
        if (!chapter) {
            res.status(404).json({ message: 'Story not found or unauthorized' });
            return;
        }
        res.status(201).json(chapter);
    } catch (error) {
        res.status(500).json({ message: 'Error adding chapter', error });
    }
});

export default router;
