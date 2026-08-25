import bcrypt from "bcrypt";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../trpc";
import { loginSchema, signupSchema } from "./auth.schema";
import { signAccessToken, signRefreshToken } from "../utils/jwt";

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
});
