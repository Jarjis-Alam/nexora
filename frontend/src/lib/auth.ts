import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users, profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { authConfig } from "./auth.config";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async session({ session, token }) {
      if (session.user && token) {
        let currentUserId = token.id as string;
        let isAdmin = (token.isAdmin as boolean) || false;

        if (currentUserId) {
          // Verify user exists in database to avoid foreign-key violations with stale sessions
          const userById = await db
            .select({ id: users.id, isAdmin: users.isAdmin, email: users.email })
            .from(users)
            .where(eq(users.id, currentUserId))
            .limit(1);

          if (userById.length > 0) {
            currentUserId = userById[0].id;
            isAdmin = userById[0].isAdmin;
          } else if (session.user.email) {
            // Self-healing: verify user exists by email if ID was modified or reseeded
            const userByEmail = await db
              .select({ id: users.id, isAdmin: users.isAdmin, email: users.email })
              .from(users)
              .where(eq(users.email, session.user.email.toLowerCase().trim()))
              .limit(1);

            if (userByEmail.length > 0) {
              currentUserId = userByEmail[0].id;
              isAdmin = userByEmail[0].isAdmin;
              token.id = currentUserId;
            } else {
              // User no longer exists in database
              return null as unknown as typeof session;
            }
          } else {
            return null as unknown as typeof session;
          }
        }

        session.user.id = currentUserId;
        (session.user as { isAdmin?: boolean }).isAdmin = isAdmin;
      }
      return session;
    },
  },
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = (credentials.email as string).toLowerCase().trim();
        const password = credentials.password as string;

        const user = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (user.length === 0) return null;

        const isValid = await bcrypt.compare(password, user[0].passwordHash);
        if (!isValid) return null;

        // Get profile
        const profile = await db
          .select()
          .from(profiles)
          .where(eq(profiles.userId, user[0].id))
          .limit(1);

        return {
          id: user[0].id,
          email: user[0].email,
          name: profile[0]?.name || email.split("@")[0],
          isAdmin: user[0].isAdmin,
        };
      },
    }),
  ],
});
