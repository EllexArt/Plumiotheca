import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany } from "typeorm";
import { Story } from "./Story";
import { Comment } from "./Comment";

@Entity()
export class Chapter {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    title!: string;

    @Column({ type: "text" })
    content!: string;

    @Column()
    order!: number;

    @ManyToOne(() => Story, (story) => story.chapters)
    story!: Story;

    @OneToMany(() => Comment, (comment) => comment.chapter)
    comments!: Comment[];

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}
