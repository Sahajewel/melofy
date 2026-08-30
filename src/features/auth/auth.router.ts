import bcrypt from "bcrypt";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "../../trpc";
import { loginSchema, refreshSchema, signupSchema } from "./auth.schema";
import {
  signAccessToken,
  signRefreshToken,
  verifyToken,
} from "../../utils/jwt";

const SALT_ROUNDS = 12;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const authRouter = router({
  // ==============================
  // SIGNUP
  // ==============================
  signup: publicProcedure
    .input(signupSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const existingUser = await ctx.db.user.findUnique({
          where: { email: input.email },
        });
        if (existingUser) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "An account with this email already exists",
          });
        }
        const hashPassword = await bcrypt.hash(input.password, SALT_ROUNDS);

        const user = await ctx.db.user.create({
          data: {
            name: input.name,
            email: input.email,
            password: hashPassword,
          },
        });

        const accessToken = signAccessToken({
          userId: user.id,
          role: user.role,
        });
        const refreshToken = signRefreshToken({
          userId: user.id,
          role: user.role,
        });

        await ctx.db.refreshToken.create({
          data: {
            token: refreshToken,
            userId: user.id,
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
          },
        });
        return {
          success: true,
          message: "Account created successfully.",
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
          },
          accessToken,
          refreshToken,
        };
      } catch (error) {
        // 💡 যদি আগেই TRPCError (যেমন: UNAUTHORIZED বা FORBIDDEN) থ্রো করা হয়ে থাকে, সেটাকেই পাস করবে
        if (error instanceof TRPCError) {
          throw error;
        }
        // 🔴 সার্ভার কনসোলে আসল এরর প্রিন্ট করবে
        console.error("signup Internal Error Log:", error);

        // 🟢 অজানা কোনো সমস্যা হলে INTERNAL_SERVER_ERROR পাঠাবে
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occured. Please try again later.",
        });
      }
    }),

  // ==============================
  // LOGIN
  // ==============================

  login: publicProcedure.input(loginSchema).mutation(async ({ ctx, input }) => {
    try {
      const user = await ctx.db.user.findUnique({
        where: { email: input.email },
      });
      if (!user) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password",
        });
      }
      if (user.isBanned || !user.isActive) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "This account is currently inactive",
        });
      }

      const isPasswordValid = await bcrypt.compare(
        input.password,
        user.password,
      );
      if (!isPasswordValid) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid email or password",
        });
      }
      const accessToken = signAccessToken({ userId: user.id, role: user.role });
      const refreshToken = signRefreshToken({
        userId: user.id,
        role: user.role,
      });

      // ১. মেয়াদকীর্ণ (Expired) টোকেন ক্লিনআপ
      await ctx.db.refreshToken.deleteMany({
        where: { userId: user.id, expiresAt: { lt: new Date() } },
      });

      // ২. নতুন রিফ্রেশ টোকেন সেভ
      await ctx.db.refreshToken.create({
        data: {
          token: refreshToken,
          userId: user.id,
          expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
        },
      });

      return {
        success: true,
        message: "Logged in successfully.",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
        accessToken,
        refreshToken,
      };
    } catch (error) {
      // 💡 যদি আগেই TRPCError (যেমন: UNAUTHORIZED বা FORBIDDEN) থ্রো করা হয়ে থাকে, সেটাকেই পাস করবে
      if (error instanceof TRPCError) {
        throw error;
      }
      // 🔴 সার্ভার কনসোলে আসল এরর প্রিন্ট করবে
      console.error("Login Failed:", error);
      // 🟢 অজানা কোনো সমস্যা হলে INTERNAL_SERVER_ERROR পাঠাবে
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong during login",
      });
    }
  }),

  // ==============================
  // REFRESH — নতুন access token নেওয়ার জন্য
  // ==============================

  refreshToken: publicProcedure
    .input(refreshSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        let payload: { userId: string; role: "USER" | "ARTIST" | "ADMIN" };
        try {
          payload = verifyToken(input.refreshToken) as typeof payload;
        } catch (error) {
          if (error instanceof TRPCError) {
            throw error;
          }
          console.error("Refresh Token failed:", error);
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "An Unexpected error occured. Please try again later.",
          });
        }

        // DB তে token টা আছে কিনা, revoke হয়নি তো, expire হয়নি তো — সব চেক করা হচ্ছে
        const storedToken = await ctx.db.refreshToken.findUnique({
          where: { token: input.refreshToken },
        });
        if (
          !storedToken ||
          storedToken.revoked ||
          storedToken.expiresAt < new Date()
        ) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "Refresh token expired or revoked",
          });
        }
        // Token rotation: পুরনোটা revoke করে নতুন একটা refresh token ইস্যু করা হচ্ছে
        // (security best practice — একই refresh token বারবার ব্যবহার হলে leak হলে বোঝা কঠিন হয়)
        await ctx.db.refreshToken.update({
          where: { id: storedToken.id },
          data: {
            revoked: true,
          },
        });

        const decoded = verifyToken(input.refreshToken) as {
          userId: string;
          role: string;
        };
        const newAccessToken = signAccessToken({
          userId: decoded.userId,
          role: decoded.role as "USER" | "ARTIST" | "ADMIN",
        });
        const newRefreshToken = signRefreshToken({
          userId: decoded.userId,
          role: decoded.role as "USER" | "ARTIST" | "ADMIN",
        });

        await ctx.db.refreshToken.create({
          data: {
            token: newRefreshToken,
            userId: payload.userId,
            expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
          },
        });

        return {
          success: true,
          message: "Token Refreshed successfully.",
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error("Refresh Token Error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Something went wrong while refreshing the token",
        });
      }
    }),

  // ==============================
  // LOGOUT — refresh token revoke করে দেওয়া হচ্ছে
  // ==============================
  logout: publicProcedure
    .input(refreshSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        // 1. ডাটাবেসে উক্ত টোকেনটি থাকলে সেটি Revoke করে দেওয়া
        await ctx.db.refreshToken.updateMany({
          where: { token: input.refreshToken },
          data: { revoked: true },
        });

        return { success: true, message: "Logged out successfully." };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        // 2. সার্ভার লগে আসল এরর সেভ রাখা
        console.error("Logout Error:", error);

        // 3. ক্লায়েন্টকে নিরাপদ কাস্টম এরর পাঠানো
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            "Something went wrong while logging out. Please try again later.",
        });
      }
    }),
  // ==============================
  // ME — বর্তমান logged-in user এর তথ্য
  // ==============================

  me: protectedProcedure.query(async ({ ctx }) => {
    try {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.user?.userId },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          avatarUrl: true,
          createdAt: true,
        },
      });
      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }
      return { success: true, message: "User fetch successfully", user };
    } catch (error) {
      if (error instanceof TRPCError) {
        throw error;
      }
      console.error("Get User error:", error);

      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Something went wrong. Please try again later",
      });
    }
  }),
});
