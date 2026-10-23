import { withWorkflow } from "workflow/next";
import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  outputFileTracingRoot: process.cwd(),
  outputFileTracingExcludes: {
    '/*': ['./data/**/*', './.env', './.env.*', './.workflow-data/**/*', './tests/**/*'],
  },
  serverExternalPackages: ["pg", "@electric-sql/pglite", "kysely-pglite"],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};
export default withWorkflow(config);
