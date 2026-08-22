import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { AppError } from "../middleware/error";

const execFileAsync = promisify(execFile);

/**
 * PDF → PNG pages via poppler's pdftoppm. A system utility instead of a
 * JS package: zero npm footprint, handles DPI and rotation.
 */
export async function pdfToImages(
  pdfPath: string,
  outDir: string,
  dpi = 150,
): Promise<{ pageCount: number; imagePaths: string[] }> {
  await mkdir(outDir, { recursive: true });
  const prefix = path.join(outDir, "page");
  try {
    await execFileAsync("pdftoppm", ["-png", "-r", String(dpi), pdfPath, prefix]);
  } catch (err) {
    throw new AppError(422, `PDF conversion failed: ${err instanceof Error ? err.message : String(err)}`);
  }
  const files = (await readdir(outDir))
    .filter((f) => f.endsWith(".png"))
    .sort((a, b) => {
      const na = Number(a.match(/(\d+)\.png$/)?.[1] ?? 0);
      const nb = Number(b.match(/(\d+)\.png$/)?.[1] ?? 0);
      return na - nb;
    });
  if (files.length === 0) {
    throw new AppError(422, "pdftoppm produced no page images");
  }
  return {
    pageCount: files.length,
    imagePaths: files.map((f) => path.join(outDir, f)),
  };
}
