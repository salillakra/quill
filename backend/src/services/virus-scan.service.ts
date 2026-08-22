import NodeClam from "clamscan";
import { env } from "../config/env";
import { logger } from "../utils/logger";

export interface VirusScanResult {
  scanned: boolean;
  safe: boolean;
  threat?: string;
  error?: string;
}

let clamInstance: any = null;
let clamInitPromise: Promise<any> | null = null;

/**
 * Initialize the ClamAV scanner instance (singleton).
 * Falls back gracefully if ClamAV is not installed in the environment.
 */
async function getClamInstance(): Promise<any> {
  if (clamInstance) return clamInstance;
  if (clamInitPromise) return clamInitPromise;

  clamInitPromise = (async () => {
    try {
      const ClamScan = new NodeClam();
      const instance = await ClamScan.init({
        removeInfected: false,
        quarantineInfected: false,
        debugMode: false,
        scanLog: null,
        clamscan: {
          path: env.CLAMAV_BINARY_PATH || "/usr/bin/clamscan",
          scanArchives: true,
          active: true,
        },
        clamdscan: {
          socket: env.CLAMAV_SOCKET || false,
          host: env.CLAMAV_HOST || false,
          port: env.CLAMAV_PORT || false,
          timeout: 60000,
          localFallback: true,
          path: "/usr/bin/clamdscan",
          multiscan: true,
          active: true,
          bypassTest: false,
        },
        preference: "clamscan",
      });
      logger.info("ClamAV scanner initialized");
      return instance;
    } catch (err: any) {
      logger.warn(`ClamAV not available: ${err?.message ?? String(err)}. File scanning disabled.`);
      return null;
    }
  })();

  clamInstance = await clamInitPromise;
  return clamInstance;
}

/**
 * Scan a file for viruses.
 * @param filePath - absolute path to the file on disk
 * @returns VirusScanResult - whether it was scanned, whether safe, and threat name if found
 */
export async function scanFile(filePath: string): Promise<VirusScanResult> {
  const clam = await getClamInstance();

  // ClamAV unavailable — skip scanning but record that it was skipped
  if (!clam) {
    return { scanned: false, safe: true, error: "ClamAV not available" };
  }

  try {
    const { isInfected, viruses } = await clam.isInfected(filePath);
    if (isInfected) {
      logger.warn(`Virus detected in ${filePath}`, { viruses });
      return { scanned: true, safe: false, threat: (viruses as string[])?.join(", ") };
    }
    return { scanned: true, safe: true };
  } catch (err: any) {
    logger.error(`Virus scan failed for ${filePath}: ${err?.message ?? String(err)}`);
    return { scanned: false, safe: true, error: err?.message ?? String(err) };
  }
}

/**
 * Scan a buffer in-memory (writes to temp file, scans, cleans up).
 * Used for uploads where the file hasn't been persisted yet.
 */
export async function scanBuffer(data: Uint8Array, tempPath: string): Promise<VirusScanResult> {
  const { writeFile, rm } = await import("node:fs/promises");
  await writeFile(tempPath, data);
  try {
    return await scanFile(tempPath);
  } finally {
    await rm(tempPath, { force: true });
  }
}

/**
 * Scan a buffer directly using a temporary file that is cleaned up afterward.
 * Prefer this for uploads so malware is rejected before object storage writes.
 */
export async function scanBufferDirect(data: Uint8Array): Promise<VirusScanResult> {
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const tempPath = join(tmpdir(), `clam-scan-${crypto.randomUUID()}`);
  return scanBuffer(data, tempPath);
}
