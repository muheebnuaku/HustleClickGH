import NextAuth, { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import AppleProvider from "next-auth/providers/apple";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";

// Helper to generate unique user ID
function generateUserId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'USR';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
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
          throw new Error("User not found");
        }

        const isPasswordValid = await compare(credentials.password, user.password);

        if (!isPasswordValid) {
          throw new Error("Invalid password");
        }

        // Check if selected role matches actual user role
        if (credentials.selectedRole && credentials.selectedRole !== user.role) {
          throw new Error("Account type mismatch. Please select the correct account type.");
        }

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
            // Create new user for OAuth
            const userId = generateUserId();
            await prisma.user.create({
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
              },
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
