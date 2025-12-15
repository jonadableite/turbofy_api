/**
 * Panda Video API Client
 * 
 * Cliente HTTP para interagir com a API do Panda Video
 * 
 * @security Nunca expor API key em logs
 * @performance Cache de tokens quando aplicável
 * @maintainability Isolamento completo da implementação HTTP
 */

import axios, { AxiosInstance, AxiosError } from "axios";
import { env } from "../../../config/env";
import { logger } from "../../logger";

const BASE_URL = "https://api-v2.pandavideo.com.br";

export interface PandaVideoResponse<T = any> {
  data: T;
}

export interface PandaVideoVideo {
  video_id: string;
  title: string;
  description?: string;
  status: "processing" | "ready" | "error";
  duration?: number;
  thumbnail?: string;
  folder_id?: string;
  created_at?: string;
  updated_at?: string;
}

export interface PandaVideoThumbnail {
  thumb_id: string;
  url: string;
  width: number;
  height: number;
  created_at?: string;
}

export interface PandaVideoSubtitle {
  subtitle_id: string;
  language: string;
  url: string;
  created_at?: string;
}

export interface PandaVideoFolder {
  folder_id: string;
  name: string;
  parent_id?: string;
  created_at?: string;
}

export class PandaVideoClient {
  private client: AxiosInstance;

  constructor() {
    if (!env.PANDAS_APIKEY) {
      throw new Error("PANDAS_APIKEY is required for Panda Video integration");
    }

    this.client = axios.create({
      baseURL: BASE_URL,
      headers: {
        Authorization: env.PANDAS_APIKEY,
        "Content-Type": "application/json",
      },
      timeout: 30000, // 30 segundos
    });

    // Interceptor para logs (sem expor API key)
    this.client.interceptors.request.use(
      (config) => {
        logger.debug(
          {
            method: config.method,
            url: config.url,
          },
          "Panda Video API request"
        );
        return config;
      },
      (error) => {
        logger.error({ error: error.message }, "Panda Video API request error");
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        const status = error.response?.status;
        const message = error.response?.data
          ? (error.response.data as any).message || error.message
          : error.message;

        logger.error(
          {
            status,
            message,
            url: error.config?.url,
          },
          "Panda Video API error"
        );

        return Promise.reject(error);
      }
    );
  }

  async listVideos(params?: {
    page?: number;
    limit?: number;
    title?: string;
    status?: string;
    folder_id?: string;
    root_folder?: number;
  }): Promise<PandaVideoVideo[]> {
    const response = await this.client.get<PandaVideoVideo[]>("/videos", { params });
    return response.data;
  }

  async getVideo(videoId: string): Promise<PandaVideoVideo> {
    const response = await this.client.get<PandaVideoVideo>(`/videos/${videoId}`);
    return response.data;
  }

  async updateVideo(videoId: string, data: {
    title?: string;
    description?: string;
    folder_id?: string;
    playback?: string[];
  }): Promise<PandaVideoVideo> {
    const response = await this.client.put<PandaVideoVideo>(`/videos/${videoId}`, data);
    return response.data;
  }

  async deleteVideos(videoIds: string[]): Promise<void> {
    await this.client.delete("/videos", {
      data: videoIds.map((id) => ({ video_id: id })),
    });
  }

  async recoverVideos(videoIds: string[]): Promise<void> {
    await this.client.post("/videos/recover", 
      videoIds.map((id) => ({ video_id: id }))
    );
  }

  async getThumbnails(videoId: string): Promise<PandaVideoThumbnail[]> {
    const response = await this.client.get<PandaVideoThumbnail[]>(`/videos/${videoId}/thumbs`);
    return response.data;
  }

  async uploadThumbnail(videoId: string, file: Buffer | NodeJS.ReadableStream, filename: string): Promise<PandaVideoThumbnail> {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const FormData = require("form-data");
    const form = new FormData();
    form.append("file", file, { filename });

    const response = await this.client.post<PandaVideoThumbnail>(
      `/videos/${videoId}/thumbs`,
      form,
      {
        headers: form.getHeaders(),
      }
    );
    return response.data;
  }

  async deleteThumbnail(videoId: string, thumbnailId: string): Promise<void> {
    await this.client.delete(`/videos/${videoId}/thumbs/${thumbnailId}`);
  }

  async listFolders(): Promise<PandaVideoFolder[]> {
    const response = await this.client.get<PandaVideoFolder[]>("/folders");
    return response.data;
  }

  async createFolder(name: string, parentId?: string): Promise<PandaVideoFolder> {
    const response = await this.client.post<PandaVideoFolder>("/folders", {
      name,
      parent_id: parentId,
    });
    return response.data;
  }

  async getUploadServers(): Promise<Array<{ server: string; url: string }>> {
    const response = await this.client.get<Array<{ server: string; url: string }>>("/hosts/uploader");
    return response.data;
  }
}

