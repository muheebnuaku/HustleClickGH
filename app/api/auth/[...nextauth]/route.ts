import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import AppleProvider from "next-auth/providers/apple";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { logActivity } from "@/lib/activity-log";

// Helper to generate unique USER + 4-digit ID
async function generateUserId(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const digits = Math.floor(1000 + Math.random() * 9000).toString();
    const userId = `USER${digits}`;
    const existing = await prisma.user.findUnique({ where: { userId } });
    if (!existing) return userId;
  }
  const digits = Math.floor(100000 + Math.random() * 900000).toString();
  return `USER${digits}`;
}

// Same alphabet as register route — no confusing characters
async function generatePersonalCallCode(): Promise<string> {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = "";
    for (let i = 0; i < 5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    const existing = await prisma.user.findUnique({ where: { personalCallCode: code } });
    if (!existing) return code;
  }
  // Extremely unlikely fallback — 6 chars
  let code = "";
  for (let i = 0; i < 6; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
    AppleProvider({
      clientId: process.env.APPLE_CLIENT_ID || "",
      clientSecret: process.env.APPLE_CLIENT_SECRET || "",
    }),
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        userId: { label: "User ID", type: "text" },
        password: { label: "Password", type: "password" },
        selectedRole: { label: "Selected Role", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.userId || !credentials?.password) {
          throw new Error("Invalid credentials");
        }

        const user = await prisma.user.findUnique({
          where: { userId: credentials.userId },
        });

        if (!user) {
          await logActivity({
            type: "login_failed",
            severity: "error",
            metadata: { userId: credentials.userId, reason: "User not found" },
          });
          throw new Error("User not found");
        }

        if (user.status !== "active") {
          await logActivity({
            type: "login_failed",
            userId: user.id,
            userName: user.fullName,
            severity: "warning",
            metadata: { userId: credentials.userId, reason: "Account suspended" },
          });
          throw new Error("Account suspended");
        }

        const isPasswordValid = await compare(credentials.password, user.password);

        if (!isPasswordValid) {
          await logActivity({
            type: "login_failed",
            userId: user.id,
            userName: user.fullName,
            severity: "error",
            metadata: { userId: credentials.userId, reason: "Invalid password" },
          });
          throw new Error("Invalid password");
        }

        await logActivity({
          type: "login",
          userId: user.id,
          userName: user.fullName,
          severity: "success",
          metadata: { userId: user.userId, role: user.role },
        });

        return {
          id: user.id,
          userId: user.userId,
          name: user.fullName,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // Handle OAuth sign in (Google/Apple)
      if (account?.provider === "google" || account?.provider === "apple") {
        try {
          // Check if user exists by email
          const existingUser = await prisma.user.findUnique({
            where: { email: user.email! },
          });

          if (!existingUser) {
            // Create new user for OAuth — always generate a personal call code
            const userId = await generateUserId();
            const personalCallCode = await generatePersonalCallCode();
            const created = await prisma.user.create({
              data: {
                userId,
                fullName: user.name || "User",
                email: user.email!,
                phone: "",
                password: "", // OAuth users don't have password
                role: "user",
                status: "active",
                referralCode: userId,
                balance: 0,
                totalEarned: 0,
                personalCallCode,
              },
            });
            await logActivity({
              type: "register",
              userId: created.id,
              userName: created.fullName,
              severity: "success",
              metadata: { provider: account.provider, email: user.email, userId: created.userId },
            });
          } else {
            // Existing user — backfill call code if somehow missing
            if (!existingUser.personalCallCode) {
              const personalCallCode = await generatePersonalCallCode();
              await prisma.user.update({
                where: { id: existingUser.id },
                data: { personalCallCode },
              });
            }
            // Check if user is suspended
            if (existingUser.status !== "active") {
              await logActivity({
                type: "login_failed",
                userId: existingUser.id,
                userName: existingUser.fullName,
                severity: "warning",
                metadata: { provider: account.provider, email: user.email, reason: "Account suspended" },
              });
              return false;
            }
            await logActivity({
              type: "login",
              userId: existingUser.id,
              userName: existingUser.fullName,
              severity: "success",
              metadata: { provider: account.provider, email: user.email, userId: existingUser.userId, role: existingUser.role },
            });
          }
          return true;
        } catch (error) {
          console.error("OAuth sign in error:", error);
          return false;
        }
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        // For credentials login
        if (!account || account.provider === "credentials") {
          token.id = user.id;
          token.userId = user.userId;
          token.role = user.role;
        } else {
          // For OAuth login, fetch user from database
          const dbUser = await prisma.user.findUnique({
            where: { email: user.email! },
          });
          if (dbUser) {
            token.id = dbUser.id;
            token.userId = dbUser.userId;
            token.role = dbUser.role;
          }
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.userId = token.userId as string;
        session.user.role = token.role as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
