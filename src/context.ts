// src/context.ts
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { db } from "./db";
import { verifyToken } from "./utils/jwt";

export async function createContext({
  req,
  res,
}: CreateExpressContextOptions): Promise<{
  db: typeof db;
  user: { userId: string; role: "USER" | "ARTIST" | "ADMIN" } | null;
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
}> {
  let user: { userId: string; role: "USER" | "ARTIST" | "ADMIN" } | null = null;

  const authHeader = req.headers.authorization; // format: "Bearer <token>"

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];

    // token undefined হতে পারে যদি header এ "Bearer " এর পর কিছু না থাকে
    if (token) {
      try {
        const payload = verifyToken(token);
        user = payload;
      } catch {
        // invalid/expired token — user null থাকবে, protectedProcedure এ এটা catch হবে
        user = null;
      }
    }
  }

  return { db, user, req, res };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
