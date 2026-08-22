import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import path from "node:path";
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, HeadObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env";

/** S3/R2 client singleton — lazily initialized */
let s3Client: S3Client | null = null;
let r2Enabled = false;

function getS3Client(): S3Client {
  if (s3Client) return s3Client;

  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY || !env.R2_BUCKET_NAME) {
    r2Enabled = false;
    // Return a dummy client; we'll check r2Enabled before use
    return new S3Client({ region: "auto" });
  }

  r2Enabled = true;
  s3Client = new S3Client({
    region: "auto",
    endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.R2_ACCESS_KEY_ID,
      secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    },
    // R2 rejects AWS SDK default CRC32 checksum headers.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
  return s3Client;
}

/** Check if R2 is configured and available */
export function isR2Enabled(): boolean {
  getS3Client(); // initializes
  return r2Enabled;
}

/** Build object key for a document file */
export function docObjectKey(docId: string, filename: string): string {
  return `documents/${docId}/${filename}`;
}

/** Build object key for a generated paper PDF */
export function paperObjectKey(paperId: string): string {
  return `papers/${paperId}.pdf`;
}

/** Build object key for a document page image (OCR) */
export function pageObjectKey(docId: string, pageNumber: number, ext = "png"): string {
  return `documents/${docId}/pages/${pageNumber}.${ext}`;
}

/** Get a time-limited signed GET URL. Bucket stays private — never a public object URL. */
export async function getPresignedGetUrl(key: string, expiresIn = 3600): Promise<string | null> {
  const client = getS3Client();
  if (!r2Enabled) return null;

  try {
    const command = new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key });
    return await getSignedUrl(client, command, { expiresIn });
  } catch (err) {
    console.error("Failed to generate presigned URL:", err);
    return null;
  }
}

/** Get presigned PUT URL for direct browser upload (valid for 1 hour by default) */
export async function getPresignedPutUrl(key: string, contentType: string, expiresIn = 3600): Promise<string | null> {
  const client = getS3Client();
  if (!r2Enabled) return null;

  try {
    const command = new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });
    return await getSignedUrl(client, command, { expiresIn });
  } catch (err) {
    console.error("Failed to generate presigned PUT URL:", err);
    return null;
  }
}

/** Upload a buffer to R2 (or local fallback) */
export async function uploadObject(
  key: string,
  data: Uint8Array | ReadableStream | Blob | Buffer,
  contentType: string
): Promise<void> {
  const client = getS3Client();

  if (r2Enabled) {
    // Use multipart upload for large files via @aws-sdk/lib-storage
    const upload = new Upload({
      client,
      params: {
        Bucket: env.R2_BUCKET_NAME,
        Key: key,
        Body: data as any,
        ContentType: contentType,
      },
      // Auto-multipart for files > 5MB
      queueSize: 4,
      partSize: 5 * 1024 * 1024,
      leavePartsOnError: false,
    });

    await upload.done();
    return;
  }

  // Local filesystem fallback
  const uploadDir = env.UPLOAD_DIR;
  const localPath = path.join(uploadDir, key);
  await mkdir(path.dirname(localPath), { recursive: true });
  await writeFile(localPath, data as Uint8Array | Buffer);
}

/** Download an object from R2 (or local fallback) — returns Uint8Array */
export async function downloadObject(key: string): Promise<Uint8Array | null> {
  const client = getS3Client();

  if (r2Enabled) {
    try {
      const command = new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key });
      const response = await client.send(command);
      if (!response.Body) return null;

      // Collect stream to Uint8Array
      const chunks: Uint8Array[] = [];
      const stream = response.Body as any;
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
      const result = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of chunks) {
        result.set(chunk, offset);
        offset += chunk.length;
      }
      return result;
    } catch (err: any) {
      if (err.name === "NoSuchKey" || err.$metadata?.httpStatusCode === 404) return null;
      throw err;
    }
  }

  // Local filesystem fallback
  const localPath = path.join(env.UPLOAD_DIR, key);
  try {
    return await readFile(localPath);
  } catch {
    return null;
  }
}

/** Delete an object from R2 (or local fallback) */
export async function deleteObject(key: string): Promise<void> {
  const client = getS3Client();

  if (r2Enabled) {
    const command = new DeleteObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key });
    await client.send(command);
    return;
  }

  // Local filesystem fallback
  const localPath = path.join(env.UPLOAD_DIR, key);
  await rm(localPath, { force: true });
}

/** Check if object exists */
export async function objectExists(key: string): Promise<boolean> {
  const client = getS3Client();

  if (r2Enabled) {
    try {
      const command = new HeadObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key });
      await client.send(command);
      return true;
    } catch (err: any) {
      if (err.name === "NotFound" || err.$metadata?.httpStatusCode === 404) return false;
      throw err;
    }
  }

  // Local filesystem fallback
  const localPath = path.join(env.UPLOAD_DIR, key);
  try {
    await readFile(localPath);
    return true;
  } catch {
    return false;
  }
}

/** Legacy helpers — kept for backward compatibility with existing code */
export function docDir(docId: string): string {
  return path.join(env.UPLOAD_DIR, docId);
}

export function pagesDir(docId: string): string {
  return path.join(docDir(docId), "pages");
}

export function docFilePath(docId: string, filename: string): string {
  return path.join(docDir(docId), filename);
}

export function papersDir(): string {
  return path.join(env.UPLOAD_DIR, "papers");
}

export function paperFilePath(paperId: string): string {
  return path.join(papersDir(), `${paperId}.pdf`);
}

/** Upload a document file (local fallback only — used during ingest before R2 migration) */
export async function saveUpload(docId: string, filename: string, data: Uint8Array): Promise<string> {
  const key = docObjectKey(docId, filename);
  await uploadObject(key, data, "application/octet-stream");
  return key; // Return the object key instead of local path
}

/** Delete all files for a document (document + pages) */
export async function deleteDocFiles(docId: string): Promise<void> {
  if (r2Enabled) {
    const client = getS3Client();
    const prefix = `documents/${docId}/`;

    try {
      // List all objects with the document prefix
      const listCommand = new ListObjectsV2Command({
        Bucket: env.R2_BUCKET_NAME,
        Prefix: prefix,
      });
      const listResponse = await client.send(listCommand);

      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        return;
      }

      // Delete all objects in batch (max 1000 per request)
      const objects = listResponse.Contents.map((obj) => ({ Key: obj.Key! }));
      const deleteCommand = new DeleteObjectsCommand({
        Bucket: env.R2_BUCKET_NAME,
        Delete: { Objects: objects, Quiet: true },
      });
      await client.send(deleteCommand);
    } catch (err) {
      console.error(`Failed to delete document files for ${docId}:`, err);
      throw err;
    }
  } else {
    await rm(docDir(docId), { recursive: true, force: true });
  }
}

/** Upload a generated paper PDF */
export async function uploadPaper(paperId: string, pdfBuffer: Uint8Array): Promise<string> {
  const key = paperObjectKey(paperId);
  await uploadObject(key, pdfBuffer, "application/pdf");
  return key;
}

/** Time-limited signed GET for a paper PDF. Do not persist this URL. */
export async function getPaperDownloadUrl(paperId: string): Promise<string | null> {
  return getPresignedGetUrl(paperObjectKey(paperId));
}

/** Time-limited signed GET for a source document. Do not persist this URL. */
export async function getDocumentDownloadUrl(docId: string, filename: string): Promise<string | null> {
  return getPresignedGetUrl(docObjectKey(docId, filename));
}

/** Download an object to a local temp file and return the file path (for workers that need local paths) */
export async function downloadObjectToFile(key: string): Promise<string | null> {
  const data = await downloadObject(key);
  if (!data) return null;

  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { writeFile } = await import("node:fs/promises");

  const ext = path.extname(key) || ".bin";
  const tempPath = join(tmpdir(), `r2-download-${crypto.randomUUID()}${ext}`);
  await writeFile(tempPath, data);
  return tempPath;
}

/** Download a document file to local temp file */
export async function downloadDocumentToFile(docId: string, filename: string): Promise<string | null> {
  const key = docObjectKey(docId, filename);
  return downloadObjectToFile(key);
}

/** Download all page images for a document to local temp directory */
export async function downloadDocumentPages(docId: string): Promise<string[]> {
  if (!r2Enabled) {
    // Local fallback - just return the existing pages dir
    return [pagesDir(docId)];
  }

  const client = getS3Client();
  const prefix = `documents/${docId}/pages/`;
  const tempPaths: string[] = [];

  try {
    // List objects with the pages prefix
    const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
    const listCommand = new ListObjectsV2Command({
      Bucket: env.R2_BUCKET_NAME,
      Prefix: prefix,
    });
    const listResponse = await client.send(listCommand);

    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      return [];
    }

    // Sort by key to ensure page order
    const objects = listResponse.Contents
      .filter((obj) => obj.Key?.endsWith(".png"))
      .sort((a, b) => (a.Key || "").localeCompare(b.Key || ""));

    // Download each page image
    for (const obj of objects) {
      const key = obj.Key!;
      const data = await downloadObject(key);
      if (data) {
        const { join } = await import("node:path");
        const { tmpdir } = await import("node:os");
        const { writeFile } = await import("node:fs/promises");

        const ext = path.extname(key) || ".png";
        const tempPath = join(tmpdir(), `r2-page-${docId}-${crypto.randomUUID()}${ext}`);
        await writeFile(tempPath, data);
        tempPaths.push(tempPath);
      }
    }

    return tempPaths;
  } catch (err) {
    console.error("Failed to download document pages from R2:", err);
    return [];
  }
}

/** Upload page images for a document after PDF conversion */
export async function uploadDocumentPages(docId: string, pagesDir: string): Promise<void> {
  if (!r2Enabled) return;

  const { readdir } = await import("node:fs/promises");
  const files = (await readdir(pagesDir)).filter((f) => f.endsWith(".png")).sort();

  for (let i = 0; i < files.length; i++) {
    const filePath = path.join(pagesDir, files[i]);
    const { readFile } = await import("node:fs/promises");
    const data = await readFile(filePath);
    const key = pageObjectKey(docId, i + 1, "png");
    await uploadObject(key, data, "image/png");
  }
}