import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { NEXTAUTH_SECRET } from "@/lib/env";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        try {
          const user = await prisma.user.findUnique({
            where: {
              email: credentials.email,
            },
          });

          if (!user) {
            return null;
          }
          
          if (!user.password) {
            return null;
          }

          const isPasswordValid = await bcrypt.compare(
            credentials.password,
            user.password
          );

          if (!isPasswordValid) {
            return null;
          }

          return {
            id: user.id,
            email: user.email,
            name: user.name,
          };
        } catch (error) {
          return null;
        }
      },
    }),
  ],
  session: {
    strategy: "jwt",
  },
  secret: NEXTAUTH_SECRET,
  pages: {
    signIn: "/login",
    signOut: "/",
  },
  callbacks: {
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = token.sub ?? ''; // Provide empty string fallback for undefined
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async redirect({ url, baseUrl }) {
      // In development, use the baseUrl
      if (process.env.NODE_ENV === 'development') {
        // If url is relative, append to baseUrl
        if (url.startsWith('/')) {
          return `${baseUrl}${url}`;
        }
        // If url is absolute but on same host, allow it
        if (url.startsWith(baseUrl)) {
          return url;
        }
        // Default to baseUrl
        return baseUrl;
      }
      
      // In production, redirect to paper-clips.com
      if (url.startsWith('/')) {
        return `https://paper-clips.com${url}`;
      }
      if (url.startsWith('https://paper-clips.com')) {
        return url;
      }
      // Default to paper-clips.com home page
      return 'https://paper-clips.com/';
    }
  },
  debug: true,
};