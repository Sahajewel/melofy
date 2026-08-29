// src/trpc.ts
import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const middleware = t.middleware;

// ==============================
// publicProcedure — কেউ login না থাকলেও call করতে পারবে
// ==============================
export const publicProcedure = t.procedure;

// ==============================
// protectedProcedure — শুধু logged-in user call করতে পারবে
// ==============================
const isAuthed = middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Must be Login",
    });
  }
  return next({
    ctx: {
      user: ctx.user, // ...ctx স্প্রেড করার দরকার নেই, tRPC স্বয়ংক্রিয়ভাবে বাকি ctx ধরে রাখে
    },
  });
});

export const protectedProcedure = t.procedure.use(isAuthed);

// ==============================
// artistProcedure — শুধু ARTIST role এর user
// ==============================
const isArtist = middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Login করা প্রয়োজন",
    });
  }
  if (ctx.user.role !== "ARTIST" && ctx.user.role !== "ADMIN") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only artist can do this",
    });
  }
  return next({
    ctx: {
      user: ctx.user,
    },
  });
});

export const artistProcedure = t.procedure.use(isArtist);

// ==============================
// adminProcedure — শুধু ADMIN role
// ==============================
const isAdmin = middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Must be Login",
    });
  }
  if (ctx.user.role !== "ADMIN") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only Admin can do this",
    });
  }
  return next({
    ctx: {
      user: ctx.user,
    },
  });
});

export const adminProcedure = t.procedure.use(isAdmin);
