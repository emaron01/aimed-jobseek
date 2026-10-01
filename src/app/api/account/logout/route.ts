import { logoutAction } from "@/app/actions/account";
import { NextResponse } from "next/server";

/**
 * Account-menu Log Out. Outside the (app) layout, so the read-only Server
 * Action gate never runs. logoutAction does not call requireOrganization.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (origin && host) {
    let originHost = "";
    try {
      originHost = new URL(origin).host;
    } catch {
      return new NextResponse("Forbidden", { status: 403 });
    }
    if (originHost !== host) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }
  await logoutAction();
  return NextResponse.redirect(new URL("/login", request.url));
}
