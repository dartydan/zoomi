// Standalone API entry point for local diagnostics. Production uses Next.js.
import app from "./app";
app.listen(Number(process.env.PORT ?? 4310), "127.0.0.1");
