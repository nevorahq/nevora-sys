import { NextResponse, type NextRequest } from "next/server";

/** Keep the standalone runtime independent from the root session proxy. */
export function proxy(_request: NextRequest): NextResponse {
  return NextResponse.next();
}

export const config = {
  matcher: ["/api/internal/:path*"],
};
