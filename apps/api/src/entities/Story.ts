import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, ManyToMany, JoinTable } from "typeorm";
import { User } from "./User";
import { Chapter } from "./Chapter";
import { Tag } from "./Tag";

/**
 * @openapi
 * components:
 *   schemas:
 *     Story:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         title:
 *           type: string
 *         description:
 *           type: string
 *         coverUrl:
 *           type: string
 *         viewsCount:
 *           type: integer
 *         likesCount:
 *           type: integer
 *         status:
 *           type: string
 *           enum: [draft, published]
 *         createdAt:
 *           type: string
 *           format: date-time
 */
@Entity()
export class Story {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column()
    title!: string;

    @Column({ type: "text", nullable: true })
    description?: string;

    @Column({ nullable: true })
    coverUrl?: string;

    @ManyToOne(() => User)
    author!: User;

    @OneToMany(() => Chapter, (chapter) => chapter.story)
    chapters!: Chapter[];

    @ManyToMany(() => Tag)
    @JoinTable()
    tags!: Tag[];

    @Column({ default: 0 })
    viewsCount!: number;

    @Column({ default: 0 })
    likesCount!: number;

    @Column({ default: "draft" }) // draft, published
    status!: string;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}
