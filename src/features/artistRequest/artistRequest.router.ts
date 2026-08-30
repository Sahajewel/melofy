import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../../trpc";
import { artistRequestSchema } from "./artistRequest.schema";

export const artistRequestRouter = router({
  createRequest: protectedProcedure
    .input(artistRequestSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        // checked user
        const user = await ctx.db.user.findUnique({
          where: { id: ctx.user.userId },
        });
        if (!user) {
          throw new TRPCError({
            code: "UNAUTHORIZED",
            message: "User not found. Please log in again.",
          });
        }

        // Role check: On;y regular user can apply
        if (user.role === "ARTIST" || user.role !== "USER") {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Only regular users can apply to become an artist",
          });
        }
        // Duplicate check using userId

        const existingRequest = await ctx.db.artistRequest.findUnique({
          where: { userId: ctx.user.userId },
        });
        if (existingRequest) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "You are already submitted an artist request.",
          });
        }

        //     create Request
        const result = await ctx.db.artistRequest.create({
          data: {
            userId: ctx.user.userId,
            stageName: input.stageName,
            bio: input.bio,
            reason: input.reason,
          },
        });
        return {
          success: true,
          message: "Artist request submitted successfully",
          result,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error("Artist request error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpectred error occured. Please try again later",
        });
      }
    }),
});
