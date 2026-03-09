import { DocumentProcessorServiceClient } from "@google-cloud/documentai";

function getCredentials() {
  const json = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (!json) {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable is not set");
  }
  try {
    return JSON.parse(json);
  } catch {
    throw new Error("GOOGLE_APPLICATION_CREDENTIALS_JSON is not valid JSON");
  }
}

export async function extractTextFromDocument(
  fileBuffer: Buffer,
  mimeType: string
): Promise<string> {
  const credentials = getCredentials();
  const projectId = process.env.GOOGLE_PROJECT_ID;
  const location = (process.env.GOOGLE_CLOUD_LOCATION || "us").toLowerCase();
  const processorId = process.env.GOOGLE_DOCUMENT_AI_PROCESSOR_ID;

  if (!projectId || !processorId) {
    throw new Error("GOOGLE_PROJECT_ID and GOOGLE_DOCUMENT_AI_PROCESSOR_ID must be set");
  }

  const client = new DocumentProcessorServiceClient({
    credentials,
    apiEndpoint: `${location}-documentai.googleapis.com`,
  });

  const name = `projects/${projectId}/locations/${location}/processors/${processorId}`;

  const encodedFile = fileBuffer.toString("base64");

  const [result] = await client.processDocument({
    name,
    rawDocument: {
      content: encodedFile,
      mimeType,
    },
  });

  const document = result.document;
  if (!document) {
    throw new Error("Document AI returned no document");
  }

  const text = document.text;
  if (!text || text.trim().length === 0) {
    throw new Error("Document AI could not extract any text from this document");
  }

  return text;
}
