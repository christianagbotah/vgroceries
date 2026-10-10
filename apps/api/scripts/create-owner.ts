import { Database } from "../src/database/database";
import { readConfig } from "../src/config";
import { hashPassword } from "../src/identity/crypto";
import { loginRequestSchema } from "@variety/contracts";
async function main() {
  const config = readConfig();
  const { email, password } = loginRequestSchema.parse({
    email: process.env.OWNER_EMAIL,
    password: process.env.OWNER_PASSWORD,
    client: "web",
  });
  const name = process.env.OWNER_NAME?.trim();
  if (!name || name.length > 100) throw Error("OWNER_NAME is required");
  const db = new Database(config);
  try {
    const user = await db.user.create({
      data: {
        email,
        name,
        role: "admin",
        passwordHash: await hashPassword(password),
      },
    });
    console.log(`Owner account created: ${user.id}`);
  } finally {
    await db.$disconnect();
  }
}
main().catch(() => {
  console.error(
    "Owner creation failed. Check configuration, credentials and whether the account already exists.",
  );
  process.exitCode = 1;
});
