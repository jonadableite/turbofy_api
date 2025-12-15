
export interface StoragePort {
  generatePresignedUploadUrl(key: string, contentType: string, expiresInSeconds?: number): Promise<string>;
  generatePresignedDownloadUrl(key: string, expiresInSeconds?: number): Promise<string>;
  getFileMetadata(key: string): Promise<{ size: number; mimeType: string } | null>;
  deleteFile(key: string): Promise<void>;
}

