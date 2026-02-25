import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from "typeorm";

/**
 * @openapi
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *         username:
 *           type: string
 *         displayName:
 *           type: string
 *         bio:
 *           type: string
 *         avatarUrl:
 *           type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 */
@Entity()
export class User {
    @PrimaryGeneratedColumn()
    id!: number;

    @Column({ unique: true })
    keycloakId!: string; // The 'sub' field from Keycloak token

    @Column({ unique: true })
    username!: string;

    @Column()
    email!: string;

    @Column({ nullable: true })
    displayName?: string;

    @Column({ type: "text", nullable: true })
    bio?: string;

    @Column({ nullable: true })
    avatarUrl?: string;

    @CreateDateColumn()
    createdAt!: Date;

    @UpdateDateColumn()
    updatedAt!: Date;
}
