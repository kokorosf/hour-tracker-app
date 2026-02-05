import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { compare } from 'bcryptjs';
import { UserRepository } from '@hour-tracker/database';
import type { ExtendedUser } from '@hour-tracker/types';

const userRepo = new UserRepository();

export const authConfig: NextAuthConfig = {
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;

        if (typeof email !== 'string' || typeof password !== 'string') {
          return null;
        }

        const user = await userRepo.findByEmailGlobal(email);
        if (!user) return null;

        const passwordValid = await compare(password, user.passwordHash);
        if (!passwordValid) return null;

        return {
          id: user.id,
          email: user.email,
          tenantId: user.tenantId,
          role: user.role,
        } satisfies ExtendedUser;
      },
    }),
  ],

  session: {
    strategy: 'jwt',
  },

  pages: {
    signIn: '/login',
    newUser: '/register',
  },

  callbacks: {
    async jwt({ token, user }) {
      // `user` is only present on initial sign-in.
      if (user) {
        const u = user as ExtendedUser;
        token.userId = u.id;
        token.email = u.email;
        token.tenantId = u.tenantId;
        token.role = u.role;
      }
      return token;
    },

    async session({ session, token }) {
      session.user = {
        id: token.userId as string,
        email: token.email as string,
        tenantId: token.tenantId as string,
        role: token.role as 'admin' | 'user',
      };
      return session;
    },
  },
};
