import * as mammoth from "mammoth";
import { extractTextFromDocument } from "./documentai";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const SUPPORTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  DOCX_MIME,
];

/**
 * Unified text extraction. Routes by MIME type:
 *   - PDF / images → Google Document AI (OCR)
 *   - DOCX         → mammoth (native Word text extraction, no OCR needed)
 *
 * Throws with a human-readable message on failure.
 */
export async function extractText(fileBuffer: Buffer, mimeType: string): Promise<string> {
  console.log("[documentExtractor] extraction started");
  if (mimeType === DOCX_MIME) {
    return extractDocxText(fileBuffer);
  }
  return extractTextFromDocument(fileBuffer, mimeType);
}

async function extractDocxText(buffer: Buffer): Promise<string> {
  let result: Awaited<ReturnType<typeof mammoth.extractRawText>>;
  try {
    result = await mammoth.extractRawText({ buffer });
  } catch (err: any) {
    throw new Error(
      `Could not parse the Word document: ${err?.message || "unknown error"}. ` +
      "Ensure the file is a valid .docx file and is not password-protected."
    );
  }

  const text = result.value?.trim() ?? "";

  if (text.length === 0) {
    throw new Error(
      "The Word document appears to be empty or contains only images. " +
      "Please ensure the document contains selectable text."
    );
  }

  return text;
}
