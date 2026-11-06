import type { CodegenConfig } from "@graphql-codegen/cli";

/**
 * Types for the app come from the API's schema, not from hand-copying.
 * Run `npm run codegen` after changing apps/api/src/schema.ts; CI fails if the
 * generated files are out of date.
 */
const config: CodegenConfig = {
  schema: "apps/api/schema.graphql",
  generates: {
    "apps/mobile/src/generated/graphql.ts": {
      plugins: ["typescript"],
      config: {
        enumsAsTypes: true, // 'CREATED' | 'PICKED_UP' ... matches how the app already uses statuses
        skipTypename: true,
        useTypeImports: true,
        scalars: { ID: "string" },
      },
    },
  },
};

export default config;
