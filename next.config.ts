import type { NextConfig } from "next";
import { serverActionAllowedOrigins } from "./src/lib/auth/trusted-origins";

const nextConfig: NextConfig = {
  // Keep PDF extraction native deps out of the webpack bundle so pdfjs can load
  // with Node polyfills (DOMMatrix) on hosts without @napi-rs/canvas.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
  // Custom domain cutover: browser Origin is APP_URL host; Render may still
  // forward x-forwarded-host as *.onrender.com. Without this list, Accept
  // (and every other Server Action) is aborted before the handler runs.
  experimental: {
    serverActions: {
      allowedOrigins: serverActionAllowedOrigins(),
    },
  },
};

export default nextConfig;
