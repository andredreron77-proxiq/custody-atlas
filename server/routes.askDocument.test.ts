import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import { createServer } from "http";
import type { Request, Response } from "express";
import { registerRoutes } from "./routes";

type MockResponse = Pick<Response, "status" | "json"> & {
  statusCode: number;
  body: unknown;
};

function createMockResponse(): MockResponse {
  return {
    statusCode: 200,
    body: undefined,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
}

test("/api/ask-document route does not throw ReferenceError for isDocumentFactLookupQuestion", async () => {
  const app = express();
  app.use(express.json());
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);

  const askDocumentLayer = (app as any).router?.stack?.find(
    (layer: any) => layer.route?.path === "/api/ask-document",
  );

  assert.ok(askDocumentLayer, "Expected /api/ask-document route to be registered");
  const askDocumentHandler = askDocumentLayer.route.stack[1]?.handle;
  assert.equal(typeof askDocumentHandler, "function", "Expected ask-document handler function");

  process.env.OPENAI_API_KEY = "test-key";

  const req = {
    body: {
      documentAnalysis: {
        document_type: "Court Order",
        summary: "Summary",
        important_terms: ["term"],
        key_dates: ["2026-01-01"],
        possible_implications: ["implication"],
        questions_to_ask_attorney: ["question"],
        extracted_facts: {
          case_number: "123",
          court_name: "Superior Court",
        },
      },
      extractedText: "Sample text",
      userQuestion: "What is the case number?",
      history: [],
      jurisdiction: {
        state: "California",
        county: "Los Angeles",
        country: "United States",
      },
    },
  } as Request;

  const res = createMockResponse();

  await askDocumentHandler(req, res);

  assert.equal(res.statusCode, 500);
  assert.notEqual((res.body as any)?.error, "isDocumentFactLookupQuestion is not defined");
});

test("/api/ask-document returns 400 for malformed request body", async () => {
  const app = express();
  app.use(express.json());
  const httpServer = createServer(app);
  await registerRoutes(httpServer, app);

  const askDocumentLayer = (app as any).router?.stack?.find(
    (layer: any) => layer.route?.path === "/api/ask-document",
  );
  assert.ok(askDocumentLayer, "Expected /api/ask-document route to be registered");
  const askDocumentHandler = askDocumentLayer.route.stack[1]?.handle;
  assert.equal(typeof askDocumentHandler, "function", "Expected ask-document handler function");

  const req = {
    body: {
      userQuestion: "",
    },
  } as Request;

  const res = createMockResponse();
  await askDocumentHandler(req, res);

  assert.equal(res.statusCode, 400);
  assert.match(String((res.body as any)?.error ?? ""), /Invalid request/);
});
