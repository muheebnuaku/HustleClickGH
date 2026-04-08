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
  const publicPaths = ["/", "/login", "/register", "/surveys"];
  const isPublicPath =
    publicPaths.includes(path) ||
    path.startsWith("/s/") ||
    path.startsWith("/api/s/");

  // Allow public paths without authentication
  if (isPublicPath) {
    return NextResponse.next();
  }

  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });

  // Admin paths
  const isAdminPath = path.startsWith("/admin") || path.startsWith("/api/admin");

  // Redirect to login if trying to access protected routes without authentication
  if (!token) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Redirect to dashboard if already authenticated and trying to access login/register
  if (token && (path === "/login" || path === "/register")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
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
