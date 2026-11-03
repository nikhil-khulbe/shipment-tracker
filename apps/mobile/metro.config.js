const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

// This app lives inside an npm workspaces monorepo (apps/mobile), so
// npm may hoist shared dependencies up to the repo root's node_modules.
// Metro only looks inside this project by default and won't find them
// there — watchFolders + nodeModulesPaths tell it to also look at the
// workspace root. Without this, workspace-hoisted packages fail to
// resolve with a confusing "Unable to resolve module" error.
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
