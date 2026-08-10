import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Skip middleware for static files and public assets
  if (
    path.startsWith("/_next") ||
    path.startsWith("/api/auth") ||
    path.includes(".") ||
    path === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  // Public paths that don't require authentication
  const publicPaths = [
    "/",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/surveys",
    "/partners",
    "/privacy",
    "/terms",
    "/data-processing-agreement",
  ];
  const isPublicPath =
    publicPaths.includes(path) ||
    path.startsWith("/s/") ||
    path.startsWith("/api/s/") ||
    path === "/api/partners" ||
    // Paystack calls this server-to-server with no session; it's signature-verified.
    path === "/api/paystack/webhook" ||
    // Biometric sign-in happens before authentication, so these must be public
    path === "/api/webauthn/auth/options" ||
    path === "/api/webauthn/auth/verify";

  // Allow public paths without authentication
  if (isPublicPath) {
    return NextResponse.next();
  }

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  // Suspended after login — the JWT stays valid, but the token's status is
  // re-checked (~30s) so we can bounce them to /login, which signs them out.
  // Server APIs are already blocked by the authoritative session status check.
  if (token && (token as { status?: string }).status === "suspended" && path !== "/login") {
    return NextResponse.redirect(new URL("/login?suspended=1", request.url));
  }

  // Admin paths
  const isAdminPath = path.startsWith("/admin") || path.startsWith("/api/admin");
  // Organization portal paths (buyer side)
  const isOrgPath = path.startsWith("/org") || path.startsWith("/api/org");

  // Redirect to login if trying to access protected routes without authentication
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Redirect to dashboard if already authenticated and trying to access login/register
  if (token && (path === "/login" || path === "/register")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Onboarding gate — contributors must provide location, ID and consent before
  // using the platform (required for Ghana Data Protection Act compliance).
  // Applies to OAuth users (created without these details) and any pre-existing
  // contributor who has not yet completed their profile. Admins/managers are exempt.
  if (
    token &&
    token.role === "user" &&
    token.profileCompleted === false &&
    path !== "/onboarding" &&
    !path.startsWith("/api")
  ) {
    return NextResponse.redirect(new URL("/onboarding", request.url));
  }

  // Consent gate — contributors who haven't accepted the current Data Processing
  // Agreement are sent to the Data & Privacy page to review and agree.
  //
  // Only applies once onboarding is complete: onboarding captures consent itself,
  // and gating both at once would bounce users between /onboarding and
  // /account/data forever (ERR_TOO_MANY_REDIRECTS).
  if (
    token &&
    token.role === "user" &&
    token.profileCompleted === true &&
    token.consentAccepted === false &&
    path !== "/account/data" &&
    !path.startsWith("/api")
  ) {
    return NextResponse.redirect(new URL("/account/data", request.url));
  }

  // Organization portal — only org accounts (and admins, for support) may enter.
  if (isOrgPath) {
    if (token?.role !== "organization" && token?.role !== "admin") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
  }

  // Admin area is admin-only. Managers are contributors-with-perks now — they
  // no longer have access to the recording page or any admin route.
  if (isAdminPath && token?.role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
