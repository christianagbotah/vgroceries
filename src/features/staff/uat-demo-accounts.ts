export interface UatDemoAccount {
  id: string;
  label: string;
  email: string;
}

const enabled = process.env.NEXT_PUBLIC_UAT_DEMO_LOGIN === "1";
const adminEmail = process.env.NEXT_PUBLIC_UAT_DEMO_ADMIN_EMAIL?.trim();

export const UAT_DEMO_ACCOUNTS: UatDemoAccount[] =
  enabled && adminEmail
    ? [
        {
          id: "uat-admin",
          label: "Administrator · UAT",
          email: adminEmail,
        },
      ]
    : [];
