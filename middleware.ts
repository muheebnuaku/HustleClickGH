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

  // Check admin access — admin can access all, manager can only access call-recordings
  if (isAdminPath) {
    if (token?.role !== "admin" && token?.role !== "manager") {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    // Manager can only access /admin/call-recordings page + API
    if (token?.role === "manager") {
      const isCallRecordingsPath = path === "/admin/call-recordings" ||
                                    path.startsWith("/api/admin/call-recordings");
      if (!isCallRecordingsPath) {
        return NextResponse.redirect(new URL("/admin/call-recordings", request.url));
      }
    }
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
