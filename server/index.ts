import "./env";
import express, { type Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";

const app = express();
const httpServer = createServer(app);

app.set("trust proxy", 1);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use("/api/webhooks/stripe", express.raw({ type: "application/json" }));

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

const isLocalRequest = (req: Request): boolean => {
  const forwardedFor = req.headers["x-forwarded-for"];
  const forwardedValue = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
  const forwardedIp = typeof forwardedValue === "string" ? forwardedValue.split(",")[0]?.trim() : "";
  const candidateIp = forwardedIp || req.ip || req.socket.remoteAddress || "";

  return (
    process.env.NODE_ENV !== "production"
    || candidateIp === "127.0.0.1"
    || candidateIp === "::1"
    || candidateIp === "::ffff:127.0.0.1"
    || candidateIp === "localhost"
  );
};

const buildRateLimiter = (options: { windowMs: number; max: number }) =>
  rateLimit({
    windowMs: options.windowMs,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false },
    skip: (req) => isLocalRequest(req),
    message: { message: "Too many requests. Please slow down." },
  });

const generalApiLimiter = buildRateLimiter({
  windowMs: 60 * 1000,
  max: 100,
});

const aiQueryLimiter = buildRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
});

const authLimiter = buildRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
});

app.use("/api", generalApiLimiter);
app.use("/api/ask", aiQueryLimiter);
app.use("/api/conversations/:conversationId/messages", aiQueryLimiter);
app.use("/api/user-profile", authLimiter);
app.use("/api/user/preferences", authLimiter);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // Serve the app on the port specified in the environment variable PORT.
  // Default to 5050 for local dev + QA consistency.
  // This serves both the API and the client.
const port = parseInt(process.env.PORT || "5050", 10);
const host = "0.0.0.0";

httpServer.listen(port, host, () => {
  log(`serving on http://${host}:${port}`);
});
})();
