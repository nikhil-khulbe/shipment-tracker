/**
 * Runs via jest's `setupFiles`, before any test module (and therefore
 * before config.ts) is imported — so config's required() checks pass
 * with these placeholder-but-valid values. MONGODB_URI is overwritten
 * with the real in-memory server URI inside setup.ts's beforeAll.
 */
process.env.NODE_ENV = "test";
process.env.MONGODB_URI = "mongodb://127.0.0.1:27017/placeholder-until-memory-server-starts";
process.env.JWT_SECRET = "test-only-secret-not-for-production-use";
process.env.JWT_EXPIRES_IN = "1h";
