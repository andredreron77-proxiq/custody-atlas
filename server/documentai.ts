import { DocumentProcessorServiceClient } from "@google-cloud/documentai";
import { PDFDocument } from "pdf-lib";

const DOCUMENT_AI_SAFE_PAGE_LIMIT = 14;

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

async function extractTextFromProcessResponse(
  client: DocumentProcessorServiceClient,
  name: string,
  fileBuffer: Buffer,
  mimeType: string,
): Promise<string> {
  const encodedFile = fileBuffer.toString("base64");

  const processResult = await client.processDocument({
    name,
    rawDocument: {
      content: encodedFile,
      mimeType,
    },
  });

  const processResponse = Array.isArray(processResult) ? processResult[0] : processResult;
  const responseRecord = (processResponse ?? null) as Record<string, unknown> | null;
  console.log("[documentai] raw response keys:", Object.keys(responseRecord || {}));
  const document =
    (responseRecord?.document as { text?: string } | undefined)
    ?? (
      Array.isArray(responseRecord?.documents)
        ? ((responseRecord?.documents?.[0] as Record<string, unknown> | undefined)?.document as { text?: string } | undefined)
          ?? (responseRecord?.documents?.[0] as { text?: string } | undefined)
        : undefined
    )
    ?? ((responseRecord?.result as Record<string, unknown> | undefined)?.document as { text?: string } | undefined)
    ?? ((responseRecord?.response as Record<string, unknown> | undefined)?.document as { text?: string } | undefined);

  if (!document) {
    console.error("[documentai] unexpected processDocument response shape", {
      mimeType,
      topLevelKeys: responseRecord ? Object.keys(responseRecord) : [],
      resultKeys: responseRecord?.result && typeof responseRecord.result === "object"
        ? Object.keys(responseRecord.result as Record<string, unknown>)
        : [],
      responseKeys: responseRecord?.response && typeof responseRecord.response === "object"
        ? Object.keys(responseRecord.response as Record<string, unknown>)
        : [],
      documentsLength: Array.isArray(responseRecord?.documents) ? (responseRecord?.documents?.length ?? 0) : 0,
    });
    throw new Error("Unable to extract text from this document. Please try a smaller file or a different format.");
  }

  const text = document.text;
  if (!text || text.trim().length === 0) {
    throw new Error("Unable to extract text from this document. Please try a smaller file or a different format.");
  }

  return text;
}

async function splitPdfIntoChunks(fileBuffer: Buffer, chunkSize: number): Promise<Buffer[]> {
  const sourcePdf = await PDFDocument.load(fileBuffer);
  const pageCount = sourcePdf.getPageCount();
  const chunks: Buffer[] = [];

  for (let start = 0; start < pageCount; start += chunkSize) {
    const end = Math.min(start + chunkSize, pageCount);
    const chunkPdf = await PDFDocument.create();
    const pages = await chunkPdf.copyPages(
      sourcePdf,
      Array.from({ length: end - start }, (_, index) => start + index),
    );

    for (const page of pages) {
      chunkPdf.addPage(page);
    }

    const chunkBytes = await chunkPdf.save();
    chunks.push(Buffer.from(chunkBytes));
  }

  return chunks;
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
  const isPdf = mimeType === "application/pdf";

  if (!isPdf) {
    return extractTextFromProcessResponse(client, name, fileBuffer, mimeType);
  }

  const pdf = await PDFDocument.load(fileBuffer);
  const pageCount = pdf.getPageCount();

  if (pageCount <= DOCUMENT_AI_SAFE_PAGE_LIMIT) {
    return extractTextFromProcessResponse(client, name, fileBuffer, mimeType);
  }

  const chunks = await splitPdfIntoChunks(fileBuffer, DOCUMENT_AI_SAFE_PAGE_LIMIT);
  const extractedTexts: string[] = [];

  for (const chunkBuffer of chunks) {
    const chunkText = await extractTextFromProcessResponse(client, name, chunkBuffer, mimeType);
    if (chunkText.trim()) {
      extractedTexts.push(chunkText.trim());
    }
  }

  const combinedText = extractedTexts.join("\n\n");
  if (!combinedText.trim()) {
    throw new Error("Unable to extract text from this document. Please try a smaller file or a different format.");
  }

  return combinedText;
}
