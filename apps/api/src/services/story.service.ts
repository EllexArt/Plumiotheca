import { AppDataSource } from '../data-source';
import { Story } from '../entities/Story';
import { User } from '../entities/User';
import { Tag } from '../entities/Tag';

export class StoryService {
    private static storyRepository = AppDataSource.getRepository(Story);
    private static tagRepository = AppDataSource.getRepository(Tag);

    static async getAllStories(options: { publishedOnly?: boolean, tag?: string } = {}): Promise<Story[]> {
        const query = this.storyRepository.createQueryBuilder("story")
            .leftJoinAndSelect("story.author", "author")
            .leftJoinAndSelect("story.tags", "tag")
            .leftJoinAndSelect("story.chapters", "chapter");

        if (options.publishedOnly) {
            query.andWhere("story.status = :status", { status: 'published' });
        }

        if (options.tag) {
            query.andWhere("tag.name = :tagName", { tagName: options.tag });
        }

        return await query.getMany();
    }

    static async getStoryById(id: number): Promise<Story | null> {
        return await this.storyRepository.findOne({
            where: { id },
            relations: ["author", "tags", "chapters"]
        });
    }

    static async createStory(user: User, data: Partial<Story>, tagNames: string[] = []): Promise<Story> {
        const tags = await this.findOrCreateTags(tagNames);
        
        const story = this.storyRepository.create({
            ...data,
            author: user,
            tags: tags,
            status: data.status || 'draft'
        });

        return await this.storyRepository.save(story);
    }

    static async updateStory(id: number, userId: number, data: Partial<Story>, tagNames?: string[]): Promise<Story | null> {
        const story = await this.storyRepository.findOne({ where: { id }, relations: ["author", "tags"] });
        
        if (!story || story.author.id !== userId) return null;

        if (tagNames) {
            story.tags = await this.findOrCreateTags(tagNames);
        }

        Object.assign(story, data);
        return await this.storyRepository.save(story);
    }

    static async deleteStory(id: number, userId: number): Promise<boolean> {
        const story = await this.storyRepository.findOne({ where: { id }, relations: ["author"] });
        if (!story || story.author.id !== userId) return false;

        await this.storyRepository.remove(story);
        return true;
    }

    static async incrementViews(id: number): Promise<void> {
        await this.storyRepository.increment({ id }, "viewsCount", 1);
    }

    private static async findOrCreateTags(tagNames: string[]): Promise<Tag[]> {
        const tags: Tag[] = [];
        for (const name of tagNames) {
            let tag = await this.tagRepository.findOne({ where: { name } });
            if (!tag) {
                tag = this.tagRepository.create({ name });
                await this.tagRepository.save(tag);
            }
            tags.push(tag);
        }
        return tags;
    }
}
