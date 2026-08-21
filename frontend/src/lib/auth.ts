import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "@/db";
import { users, profiles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { authConfig } from "./auth.config";

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email as string;
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
