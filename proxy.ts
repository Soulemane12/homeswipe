import { NextResponse, type NextRequest } from "next/server";

const JUDGE_COOKIE = "hs_judge";

/** `?judge=1` / `?judge=0` toggles judge mode (a cookie) and strips the parameter. */
export function proxy(request: NextRequest) {
  const judge = request.nextUrl.searchParams.get("judge");
  if (judge === null) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.searchParams.delete("judge");
  const response = NextResponse.redirect(url);
  if (judge === "1") response.cookies.set(JUDGE_COOKIE, "1", { path: "/", sameSite: "lax", maxAge: 60 * 60 * 24 * 30 });
  else response.cookies.delete(JUDGE_COOKIE);
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico|webp)$).*)"],
};
