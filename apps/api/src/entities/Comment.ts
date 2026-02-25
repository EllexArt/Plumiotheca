import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne } from "typeorm";
import { User } from "./User";
import { Chapter } from "./Chapter";

@Entity()
export class Comment {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ type: "text" })
    content!: string;

    @ManyToOne(() => User)
    author!: User;

    @ManyToOne(() => Chapter, (chapter) => chapter.comments)
    chapter!: Chapter;

    @CreateDateColumn()
    createdAt!: Date;
}
