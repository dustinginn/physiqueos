import { seedUser } from "../seed/user";

export function createUserRepository(user = null, options = {}) {
  return {
    async getCurrentUser() {
      return user;
    },

    async getUserById(userId) {
      return user?.id === userId ? user : null;
    },

    async updateUser(userId, patch) {
      const currentUser = user?.id === userId ? user : null;

      if (!currentUser) return null;

      Object.assign(user, {
        ...currentUser,
        ...patch,
        updatedAt: new Date().toISOString(),
      });
      options.onChange?.();

      return user;
    },
  };
}

export const UserRepository = createUserRepository(seedUser);
