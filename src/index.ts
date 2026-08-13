// src/index.ts
import "dotenv/config";
import express from "express";
import cors from "cors";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "./routers/_app.js";
import { createContext } from "./context.js";

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL ?? "http://localhost:5173", // Vite এর default port
    credentials: true,
  }),
);
app.use(express.json());

// সব tRPC route এখানে mount হচ্ছে, /trpc prefix এর নিচে
app.use(
  "/trpc",
  createExpressMiddleware({
    router: appRouter,
    createContext,
  }),
);

// সাধারণ health check route (tRPC এর বাইরে, যেমন uptime monitoring টুল ব্যবহার করবে)
app.get("/", (_req, res) => {
  res.json({ message: "Melofy API is running 🎵" });
});

const PORT = process.env.PORT ?? 4000;

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
