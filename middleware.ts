import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
  const path = request.nextUrl.pathname;

  // Public paths that don't require authentication
  const publicPaths = ["/", "/login", "/register"];
  const isPublicPath = publicPaths.includes(path) || path.startsWith("/s/");

  // Admin paths
  const isAdminPath = path.startsWith("/admin") || path.startsWith("/api/admin");

  // Redirect to login if trying to access protected routes without authentication
  if (!token && !isPublicPath) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Redirect to dashboard if already authenticated and trying to access login/register
  if (token && (path === "/login" || path === "/register")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  // Check admin access
  if (isAdminPath && token?.role !== "admin") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/profile/:path*",
    "/income/:path*",
    "/referral/:path*",
    "/my-surveys/:path*",
    "/admin/:path*",
    "/login",
    "/register",
    "/s/:path*",
    "/api/admin/:path*",
  ],
};
