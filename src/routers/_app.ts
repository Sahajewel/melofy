// src/routers/_app.ts

import { publicProcedure, router } from "../trpc.js";

// auth.router.ts, song.router.ts ইত্যাদি পরে এখানে import ও merge হবে
// import { authRouter } from "./auth.router";
// import { songRouter } from "./song.router";

export const appRouter = router({
  // simple health-check route — server ঠিকভাবে চলছে কিনা test করার জন্য
  healthCheck: publicProcedure.query(() => {
    return { status: "ok", timestamp: new Date().toISOString() };
  }),

  // auth: authRouter,
  // song: songRouter,
});

// এই type টাই frontend এ import হবে — এটা দিয়েই end-to-end type-safety আসে
export type AppRouter = typeof appRouter;
