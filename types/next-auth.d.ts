import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      userId: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: string;
      profileCompleted: boolean;
      consentAccepted: boolean;
      status: string; // "active" | "suspended" — re-checked from the DB each request
    };
  }

  interface User {
    id: string;
    userId: string;
    role: string;
    profileCompleted?: boolean;
    consentAccepted?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    userId: string;
    role: string;
    profileCompleted: boolean;
    consentAccepted: boolean;
    status?: string;
    statusAt?: number;
  }
}
