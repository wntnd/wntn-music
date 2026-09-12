// One-off: promote ADMIN_USERNAMES to root while no root exists yet. This used
// to run on every server start; Workers have no startup hook, so it is a script.
//   pnpm bootstrap
import { bootstrapRoots } from "./auth";
import { runWith, reqCtx } from "./ctx";
import { env } from "./env";

await runWith({ connectionString: env.databaseUrl }, async () => {
  await bootstrapRoots();
  await reqCtx().handle?.pool.end();
});
console.log("bootstrap done");
