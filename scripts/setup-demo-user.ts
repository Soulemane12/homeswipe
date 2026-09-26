import { closeMongo } from "@/lib/mongodb/client";
import { DEMO_USER_ID } from "@/models/user";
import { getActivePolicy } from "@/services/harness/policies";
import { getOrCreateUser } from "@/services/users";

/** Creates the demo user with default collections and the seeded v1 harness policy. */
async function main() {
  const user = await getOrCreateUser(DEMO_USER_ID);
  const policy = await getActivePolicy(DEMO_USER_ID);
  console.log(`Demo user "${user._id}" ready; active harness policy v${policy.version}.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => closeMongo());
