/**
 * Panda Video Adapter
 * 
 * Implementa VideoProviderPort usando a API do Panda Video
 * 
 * @security Nunca expor API key em logs ou respostas
 * @performance Cache de dados quando aplicável
 * @maintainability Isolamento completo da implementação Panda Video
 */

import { VideoProviderPort, Video, Thumbnail, Folder, ListVideosParams, UpdateVideoData } from "../../../ports/VideoProviderPort";
import { PandaVideoClient, PandaVideoVideo, PandaVideoThumbnail, PandaVideoFolder } from "./PandaVideoClient";
import { logger } from "../../logger";

export class PandaVideoAdapter implements VideoProviderPort {
  private client: PandaVideoClient;

  constructor() {
    this.client = new PandaVideoClient();
  }

  async listVideos(params?: ListVideosParams): Promise<Video[]> {
    try {
      const pandaVideos = await this.client.listVideos({
        page: params?.page,
        limit: params?.limit,
        title: params?.title,
        status: params?.status,
        folder_id: params?.folderId,
      });

      return pandaVideos.map((v) => this.toDomainVideo(v));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error({
        type: "PANDA_VIDEO_LIST_FAILED",
        message: "Failed to list videos from Panda Video",
        error,
        payload: { error: errorMessage },
      });
      throw new Error(`Failed to list videos: ${errorMessage}`);
    }
  }

  async getVideo(videoId: string): Promise<Video> {
    try {
      const pandaVideo = await this.client.getVideo(videoId);
      return this.toDomainVideo(pandaVideo);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error({
        type: "PANDA_VIDEO_GET_FAILED",
        message: "Failed to get video from Panda Video",
        error,
        payload: { videoId, error: errorMessage },
      });
      throw new Error(`Failed to get video ${videoId}: ${errorMessage}`);
    }
  }

  async updateVideo(videoId: string, data: UpdateVideoData): Promise<Video> {
    try {
      const pandaVideo = await this.client.updateVideo(videoId, {
        title: data.title,
        description: data.description,
        folder_id: data.folderId,
        playback: data.playback,
      });

      return this.toDomainVideo(pandaVideo);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error({
        type: "PANDA_VIDEO_UPDATE_FAILED",
        message: "Failed to update video in Panda Video",
        error,
        payload: { videoId, error: errorMessage },
      });
      throw new Error(`Failed to update video ${videoId}: ${errorMessage}`);
    }
  }

  async deleteVideos(videoIds: string[]): Promise<void> {
    try {
      await this.client.deleteVideos(videoIds);
      logger.info({
        type: "PANDA_VIDEO_DELETED",
        message: "Videos deleted from Panda Video",
        payload: { videoIds },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error({
        type: "PANDA_VIDEO_DELETE_FAILED",
        message: "Failed to delete videos from Panda Video",
        error,
        payload: { videoIds, error: errorMessage },
      });
      throw new Error(`Failed to delete videos: ${errorMessage}`);
    }
  }

  async recoverVideos(videoIds: string[]): Promise<void> {
    try {
      await this.client.recoverVideos(videoIds);
      logger.info({
        type: "PANDA_VIDEO_RECOVERED",
        message: "Videos recovered from Panda Video",
        payload: { videoIds },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error({
        type: "PANDA_VIDEO_RECOVER_FAILED",
        message: "Failed to recover videos from Panda Video",
        error,
        payload: { videoIds, error: errorMessage },
      });
      throw new Error(`Failed to recover videos: ${errorMessage}`);
    }
  }

  async getThumbnails(videoId: string): Promise<Thumbnail[]> {
    try {
      const pandaThumbnails = await this.client.getThumbnails(videoId);
      return pandaThumbnails.map((t) => this.toDomainThumbnail(t));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error({
        type: "PANDA_VIDEO_THUMBNAILS_FAILED",
        message: "Failed to get thumbnails from Panda Video",
        error,
        payload: { videoId, error: errorMessage },
      });
      throw new Error(`Failed to get thumbnails for video ${videoId}: ${errorMessage}`);
    }
  }

  async uploadThumbnail(videoId: string, file: Buffer | NodeJS.ReadableStream): Promise<Thumbnail> {
    try {
      const filename = "thumbnail.jpg"; // Default, pode ser melhorado
      const pandaThumbnail = await this.client.uploadThumbnail(videoId, file, filename);
      return this.toDomainThumbnail(pandaThumbnail);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error({
        type: "PANDA_VIDEO_THUMBNAIL_UPLOAD_FAILED",
        message: "Failed to upload thumbnail to Panda Video",
        error,
        payload: { videoId, error: errorMessage },
      });
      throw new Error(`Failed to upload thumbnail for video ${videoId}: ${errorMessage}`);
    }
  }

  async deleteThumbnail(videoId: string, thumbnailId: string): Promise<void> {
    try {
      await this.client.deleteThumbnail(videoId, thumbnailId);
      logger.info({
        type: "PANDA_VIDEO_THUMBNAIL_DELETED",
        message: "Thumbnail deleted from Panda Video",
        payload: { videoId, thumbnailId },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error({
        type: "PANDA_VIDEO_THUMBNAIL_DELETE_FAILED",
        message: "Failed to delete thumbnail from Panda Video",
        error,
        payload: { videoId, thumbnailId, error: errorMessage },
      });
      throw new Error(`Failed to delete thumbnail ${thumbnailId}: ${errorMessage}`);
    }
  }

  async listFolders(): Promise<Folder[]> {
    try {
      const pandaFolders = await this.client.listFolders();
      return pandaFolders.map((f) => this.toDomainFolder(f));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error({
        type: "PANDA_VIDEO_LIST_FOLDERS_FAILED",
        message: "Failed to list folders from Panda Video",
        error,
        payload: { error: errorMessage },
      });
      throw new Error(`Failed to list folders: ${errorMessage}`);
    }
  }

  async createFolder(name: string, parentId?: string): Promise<Folder> {
    try {
      const pandaFolder = await this.client.createFolder(name, parentId);
      return this.toDomainFolder(pandaFolder);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error({
        type: "PANDA_VIDEO_CREATE_FOLDER_FAILED",
        message: "Failed to create folder in Panda Video",
        error,
        payload: { name, parentId, error: errorMessage },
      });
      throw new Error(`Failed to create folder: ${errorMessage}`);
    }
  }

  async getPlaybackUrl(videoId: string): Promise<string> {
    try {
      const video = await this.client.getVideo(videoId);
      // Panda Video retorna a URL de playback no campo específico
      // Ajustar conforme a resposta real da API
      return `https://player.pandavideo.com.br/${video.video_id}`;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error({
        type: "PANDA_VIDEO_PLAYBACK_URL_FAILED",
        message: "Failed to get playback URL from Panda Video",
        error,
        payload: { videoId, error: errorMessage },
      });
      throw new Error(`Failed to get playback URL for video ${videoId}: ${errorMessage}`);
    }
  }

  async getEmbedUrl(videoId: string): Promise<string> {
    try {
      const video = await this.client.getVideo(videoId);
      // URL de embed do Panda Video
      return `https://player.pandavideo.com.br/embed/${video.video_id}`;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      logger.error({ error: errorMessage, videoId }, "Failed to get embed URL from Panda Video");
      throw new Error(`Failed to get embed URL for video ${videoId}: ${errorMessage}`);
    }
  }

  private toDomainVideo(pandaVideo: PandaVideoVideo): Video {
    return {
      id: pandaVideo.video_id,
      title: pandaVideo.title,
      description: pandaVideo.description,
      status: pandaVideo.status,
      duration: pandaVideo.duration,
      thumbnailUrl: pandaVideo.thumbnail,
      playbackUrl: pandaVideo.video_id ? `https://player.pandavideo.com.br/${pandaVideo.video_id}` : undefined,
      embedUrl: pandaVideo.video_id ? `https://player.pandavideo.com.br/embed/${pandaVideo.video_id}` : undefined,
      folderId: pandaVideo.folder_id,
      createdAt: pandaVideo.created_at ? new Date(pandaVideo.created_at) : undefined,
      updatedAt: pandaVideo.updated_at ? new Date(pandaVideo.updated_at) : undefined,
    };
  }

  private toDomainThumbnail(pandaThumbnail: PandaVideoThumbnail): Thumbnail {
    return {
      id: pandaThumbnail.thumb_id,
      url: pandaThumbnail.url,
      width: pandaThumbnail.width,
      height: pandaThumbnail.height,
      createdAt: pandaThumbnail.created_at ? new Date(pandaThumbnail.created_at) : undefined,
    };
  }

  private toDomainFolder(pandaFolder: PandaVideoFolder): Folder {
    return {
      id: pandaFolder.folder_id,
      name: pandaFolder.name,
      parentId: pandaFolder.parent_id,
      createdAt: pandaFolder.created_at ? new Date(pandaFolder.created_at) : undefined,
    };
  }
}

