import { closeMongo } from "@/lib/mongodb/client";
import { DEMO_USER_ID } from "@/models/user";
import { resetDemoUser } from "@/services/demo/reset";

async function main() {
  const keepOnboarding = !process.argv.includes("--full");
  console.log(await resetDemoUser(DEMO_USER_ID, { keepOnboarding }));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeMongo());
