import { AppDataSource } from '../data-source';
import { Chapter } from '../entities/Chapter';
import { Story } from '../entities/Story';

export class ChapterService {
    private static chapterRepository = AppDataSource.getRepository(Chapter);
    private static storyRepository = AppDataSource.getRepository(Story);

    static async getChaptersByStory(storyId: number): Promise<Chapter[]> {
        return await this.chapterRepository.find({
            where: { story: { id: storyId } },
            order: { order: "ASC" }
        });
    }

    static async getChapterById(id: number): Promise<Chapter | null> {
        return await this.chapterRepository.findOne({
            where: { id },
            relations: ["story", "story.author", "comments", "comments.user"]
        });
    }

    static async addChapter(storyId: number, userId: number, data: Partial<Chapter>): Promise<Chapter | null> {
        const story = await this.storyRepository.findOne({ where: { id: storyId }, relations: ["author"] });
        if (!story || story.author.id !== userId) return null;

        const count = await this.chapterRepository.count({ where: { story: { id: storyId } } });
        
        const chapter = this.chapterRepository.create({
            ...data,
            story: story,
            order: data.order !== undefined ? data.order : count + 1
        });

        return await this.chapterRepository.save(chapter);
    }

    static async updateChapter(id: number, userId: number, data: Partial<Chapter>): Promise<Chapter | null> {
        const chapter = await this.chapterRepository.findOne({ where: { id }, relations: ["story", "story.author"] });
        if (!chapter || chapter.story.author.id !== userId) return null;

        Object.assign(chapter, data);
        return await this.chapterRepository.save(chapter);
    }

    static async deleteChapter(id: number, userId: number): Promise<boolean> {
        const chapter = await this.chapterRepository.findOne({ where: { id }, relations: ["story", "story.author"] });
        if (!chapter || chapter.story.author.id !== userId) return false;

        await this.chapterRepository.remove(chapter);
        return true;
    }
}
