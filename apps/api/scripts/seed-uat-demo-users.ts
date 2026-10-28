import { Database } from "../src/database/database";
import { readConfig } from "../src/config";
import { hashPassword, randomToken } from "../src/identity/crypto";

async function main() {
  const config = readConfig();
  const demo = config.uatDemoLogin;
  if (!demo) throw new Error("UAT demo login configuration is not enabled");
  const db = new Database(config);
  try {
    await db.location.upsert({
      where: { id: config.stockLocationId },
      create: { id: config.stockLocationId, name: "Variety Groceries UAT stock" },
      update: { active: true },
    });
    for (const account of demo.accounts) {
      const existing = await db.user.findUnique({ where: { email: account.email } });
      const user = existing
        ? await db.user.update({
            where: { id: existing.id },
            data: { name: account.name, role: account.role, active: true },
          })
        : await db.user.create({
            data: {
              name: account.name,
              email: account.email,
              phone: "",
              passwordHash: await hashPassword(randomToken()),
              role: account.role,
              active: true,
            },
          });
      await db.userLocation.upsert({
        where: { userId_locationId: { userId: user.id, locationId: config.stockLocationId } },
        create: { userId: user.id, locationId: config.stockLocationId },
        update: {},
      });
    }
    console.log(JSON.stringify({ event: "identity.uat_demo_users_seeded", accounts: demo.accounts.map(({ id, role }) => ({ id, role })) }));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "UAT demo user seed failed");
  process.exitCode = 1;
});
