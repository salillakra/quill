declare module "clamscan" {
  interface ClamScanOptions {
    removeInfected?: boolean;
    quarantineInfected?: boolean | string;
    scanLog?: string | null;
    debugMode?: boolean;
    scanRecursively?: boolean;
    clamscan?: {
      path?: string;
      db?: string | null;
      scanArchives?: boolean;
      active?: boolean;
    };
    clamdscan?: {
      socket?: string | boolean;
      host?: string | boolean;
      port?: string | number | boolean;
      timeout?: number;
      localFallback?: boolean;
      path?: string;
      configFile?: string | null;
      multiscan?: boolean;
      reloadDb?: boolean;
      active?: boolean;
      bypassTest?: boolean;
      tls?: boolean;
    };
    preference?: "clamscan" | "clamdscan";
  }

  interface ClamScanInstance {
    isInfected(
      filePath: string
    ): Promise<{ isInfected: boolean; viruses: string[] | null }>;
    scanFile(
      filePath: string,
      options?: { scanArchives?: boolean }
    ): Promise<{ isInfected: boolean; viruses: string[] | null; file: string }>;
    scanDir(dir: string, options?: object): Promise<any>;
    scanFiles(files: string[], options?: object): Promise<any>;
  }

  export default class NodeClam {
    constructor();
    init(options?: ClamScanOptions): Promise<ClamScanInstance>;
  }
}
