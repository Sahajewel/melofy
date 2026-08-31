import { TRPCError } from "@trpc/server";
import { adminProcedure, protectedProcedure, router } from "../../trpc";
import {
  artistApprovedSchema,
  artistRejectedSchema,
  artistRequestSchema,
} from "./artistRequest.schema";

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
  approvedArtistRequest: adminProcedure
    .input(artistApprovedSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        // 1. Request খুঁজে বের করা
        const artistRequest = await ctx.db.artistRequest.findUnique({
          where: { id: input.requestId },
        });

        if (!artistRequest) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Artist request not found",
          });
        }
        if (artistRequest.status !== "PENDING") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This request is already approved",
          });
        }

        // 2. Transaction দিয়ে ৩টি কাজ একসাথে সম্পন্ন করা

        const [updatedRequest, updatedUser, newProfile] =
          await ctx.db.$transaction([
            ctx.db.artistRequest.update({
              where: { id: artistRequest.id },
              data: {
                status: "APPROVED",
                reviewedAt: new Date(),
              },
            }),
            // user role update

            ctx.db.user.update({
              where: { id: artistRequest.userId },
              data: {
                role: "ARTIST",
              },
            }),
            ctx.db.artistProfile.create({
              data: {
                userId: artistRequest.userId,
                stageName: artistRequest.stageName,
                bio: artistRequest.bio,
              },
            }),
          ]);
        return {
          success: true,
          message: "Artist request approved successfully",
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error("Approved artist request error:", error);

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occured. Please try again later.",
        });
      }
    }),
  rejectedArtistRequest: adminProcedure
    .input(artistRejectedSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const artistRequest = await ctx.db.artistRequest.findUnique({
          where: { id: input.requestId },
        });
        if (!artistRequest) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Artist request not found",
          });
        }
        if (artistRequest.status !== "PENDING") {
          throw new TRPCError({
            code: "CONFLICT",
            message: `Cannot reject a request that is already ${artistRequest.status.toLowerCase()}`,
          });
        }

        const result = await ctx.db.artistRequest.update({
          where: { id: artistRequest.id },
          data: {
            status: "REJECTED",
          },
        });
        return {
          success: true,
          message: "Artist request successfully rejected",
          result,
        };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        console.error("Artist rejected error:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "An unexpected error occured. please try again later",
        });
      }
    }),
});
