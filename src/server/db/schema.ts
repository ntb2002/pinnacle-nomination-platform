// The Drizzle schema: one object for the db client and drizzle-kit.
// Tables live in ./tables/* by area. After editing them, run `npm run db:generate`.
export * from "./tables/enums";
export * from "./tables/auth";
export * from "./tables/program";
export * from "./tables/entries";
export * from "./tables/payments";
export * from "./tables/judging";
export * from "./tables/system";
