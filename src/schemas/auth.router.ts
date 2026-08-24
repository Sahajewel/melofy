import bcrypt from "bcrypt";
import { TRPCError } from "@trpc/server";
import { publicProcedure, router } from "../trpc";
import { signupSchema } from "./auth.schema";
import { signAccessToken, signRefreshToken } from "../utils/jwt";

const SALT_ROUNDS = 12;
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const authRouter = router({
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
        console.error("signup failed", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "Something went wrong during signup",
          cause: error,
        });
      }
    }),
});
