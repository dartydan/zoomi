import { db, migrateDatabase } from "./database";
import { migrateAuth } from "./auth";
await migrateDatabase();
await migrateAuth();
await db.close();
console.log("Audit database schema is ready.");
