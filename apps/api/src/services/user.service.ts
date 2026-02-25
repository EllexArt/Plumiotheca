import { AppDataSource } from '../data-source';
import { User } from '../entities/User';

export class UserService {
    private static userRepository = AppDataSource.getRepository(User);

    /**
     * Synchronise un utilisateur à partir des informations du jeton Keycloak.
     * Si l'utilisateur n'existe pas, il est créé.
     */
    static async syncUserFromToken(tokenContent: any): Promise<User> {
        const keycloakId = tokenContent.sub;
        const email = tokenContent.email;
        const username = tokenContent.preferred_username;

        let user = await this.userRepository.findOne({ where: { keycloakId } });

        if (!user) {
            user = this.userRepository.create({
                keycloakId,
                email,
                username,
                displayName: tokenContent.name || username
            });
            await this.userRepository.save(user);
            console.log(`New user created in DB: ${username}`);
        }

        return user;
    }

    /**
     * Récupère un utilisateur par son nom d'utilisateur.
     */
    static async getUserByUsername(username: string): Promise<User | null> {
        return await this.userRepository.findOne({
            where: { username },
            select: ['id', 'username', 'displayName', 'bio', 'avatarUrl', 'createdAt']
        });
    }

    /**
     * Met à jour le profil d'un utilisateur.
     */
    static async updateProfile(user: User, profileData: { displayName?: string, bio?: string, avatarUrl?: string }): Promise<User> {
        if (profileData.displayName !== undefined) user.displayName = profileData.displayName;
        if (profileData.bio !== undefined) user.bio = profileData.bio;
        if (profileData.avatarUrl !== undefined) user.avatarUrl = profileData.avatarUrl;

        return await this.userRepository.save(user);
    }
}
