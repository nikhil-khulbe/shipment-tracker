import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse, print } from "graphql";
import { typeDefs } from "../schema.js";

/**
 * Writes the API's schema as plain SDL. graphql-codegen reads this file to
 * generate the app's types, so the app can never silently drift from the API.
 * Imports only the schema (not config), so it runs without any env vars.
 */
const out = fileURLToPath(new URL("../../schema.graphql", import.meta.url));
writeFileSync(out, `${print(parse(typeDefs))}\n`);
console.log(`Wrote ${out}`);
