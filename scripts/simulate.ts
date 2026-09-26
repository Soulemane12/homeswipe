import { closeMongo } from "@/lib/mongodb/client";
import { DEMO_USER_ID } from "@/models/user";
import { runEvolution } from "@/services/harness/run-evolution";
import { simulateInteractions } from "@/services/simulation/run";

/**
 * CLI: pnpm simulate [profile] [count] [--evolve]
 * Runs simulated interactions through the real pipeline (tagged simulated: true).
 */
async function main() {
  const [profile = "light_modernist", countArg = "30", ...rest] = process.argv.slice(2);
  const summary = await simulateInteractions(DEMO_USER_ID, profile, Number(countArg));
  console.log(summary);
  if (rest.includes("--evolve")) {
    const evolution = await runEvolution(DEMO_USER_ID, { trigger: "manual", scope: "simulated" });
    console.log(evolution);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeMongo());
