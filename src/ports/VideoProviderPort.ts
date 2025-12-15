/**
 * VideoProviderPort
 * 
 * Interface para integração com provedores de vídeo (Panda Video, Bunny, Vimeo, YouTube)
 * 
 * @maintainability Isolamento completo da implementação de provedores
 * @testability Facilita mock em testes
 */

export interface Video {
  id: string;
  title: string;
  description?: string;
  status: "processing" | "ready" | "error";
  duration?: number; // em segundos
  thumbnailUrl?: string;
  playbackUrl?: string;
  embedUrl?: string;
  folderId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface Thumbnail {
  id: string;
  url: string;
  width: number;
  height: number;
  createdAt?: Date;
}

export interface Subtitle {
  id: string;
  language: string;
  url: string;
  createdAt?: Date;
}

export interface Folder {
  id: string;
  name: string;
  parentId?: string;
  createdAt?: Date;
}

export interface ListVideosParams {
  page?: number;
  limit?: number;
  title?: string;
  status?: string;
  folderId?: string;
}

export interface UpdateVideoData {
  title?: string;
  description?: string;
  folderId?: string;
  playback?: string[]; // Qualidades: ["240p", "480p", "720p", "1080p", "1440p", "2160p"]
}

export interface UploadMetadata {
  filename: string;
  folderId?: string;
  videoId?: string; // UUID v4 opcional
}

export interface VideoProviderPort {
  /**
   * Lista vídeos do provedor
   */
  listVideos(params?: ListVideosParams): Promise<Video[]>;

  /**
   * Obtém detalhes de um vídeo específico
   */
  getVideo(videoId: string): Promise<Video>;

  /**
   * Atualiza propriedades de um vídeo
   */
  updateVideo(videoId: string, data: UpdateVideoData): Promise<Video>;

  /**
   * Deleta vídeos (múltiplos)
   */
  deleteVideos(videoIds: string[]): Promise<void>;

  /**
   * Recupera vídeos da lixeira
   */
  recoverVideos(videoIds: string[]): Promise<void>;

  /**
   * Obtém thumbnails de um vídeo
   */
  getThumbnails(videoId: string): Promise<Thumbnail[]>;

  /**
   * Faz upload de thumbnail para um vídeo
   */
  uploadThumbnail(videoId: string, file: Buffer | NodeJS.ReadableStream): Promise<Thumbnail>;

  /**
   * Deleta um thumbnail
   */
  deleteThumbnail(videoId: string, thumbnailId: string): Promise<void>;

  /**
   * Lista pastas
   */
  listFolders(): Promise<Folder[]>;

  /**
   * Cria uma pasta
   */
  createFolder(name: string, parentId?: string): Promise<Folder>;

  /**
   * Obtém URL de embed/playback para um vídeo
   */
  getPlaybackUrl(videoId: string): Promise<string>;

  /**
   * Obtém URL de embed para um vídeo
   */
  getEmbedUrl(videoId: string): Promise<string>;
}

