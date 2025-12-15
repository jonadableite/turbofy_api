/**
 * Rotas para gerenciamento de vídeos via provedores (Panda Video, etc)
 * 
 * @security Validação de entrada com Zod
 * @maintainability Separação de concerns
 */

import { Router, Request, Response } from "express";
import { ZodError } from "zod";
import { VideoProviderFactory } from "../../adapters/video/VideoProviderFactory";
import { VideoProvider } from "../../../domain/entities/Lesson";
import { logger } from "../../logger";
import { z } from "zod";

export const videoRouter = Router();

const ListVideosQuerySchema = z.object({
  provider: z.nativeEnum(VideoProvider).default(VideoProvider.PANDA),
  page: z.string().optional().transform((v) => (v ? parseInt(v, 10) : undefined)),
  limit: z.string().optional().transform((v) => (v ? parseInt(v, 10) : undefined)),
  title: z.string().optional(),
  status: z.string().optional(),
  folderId: z.string().optional(),
});

const GetVideoParamsSchema = z.object({
  videoId: z.string().uuid("Invalid video ID format"),
  provider: z.nativeEnum(VideoProvider).default(VideoProvider.PANDA),
});

/**
 * GET /videos
 * Lista vídeos do provedor especificado
 */
videoRouter.get("/", async (req: Request, res: Response) => {
  try {
    const parsed = ListVideosQuerySchema.parse({
      ...req.query,
      provider: req.query.provider || VideoProvider.PANDA,
    });

    const videoProvider = VideoProviderFactory.create(parsed.provider);
    const videos = await videoProvider.listVideos({
      page: parsed.page,
      limit: parsed.limit,
      title: parsed.title,
      status: parsed.status,
      folderId: parsed.folderId,
    });

    return res.status(200).json({ videos });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid query parameters",
          details: error.issues,
        },
      });
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error({ error: errorMessage }, "Error listing videos");
    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to list videos",
      },
    });
  }
});

/**
 * GET /videos/:videoId
 * Obtém detalhes de um vídeo específico
 */
videoRouter.get("/:videoId", async (req: Request, res: Response) => {
  try {
    const parsed = GetVideoParamsSchema.parse({
      videoId: req.params.videoId,
      provider: req.query.provider || VideoProvider.PANDA,
    });

    const videoProvider = VideoProviderFactory.create(parsed.provider);
    const video = await videoProvider.getVideo(parsed.videoId);

    return res.status(200).json({ video });
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid parameters",
          details: error.issues,
        },
      });
    }

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error({ error: errorMessage, videoId: req.params.videoId }, "Error getting video");
    
    if (errorMessage.includes("404") || errorMessage.includes("not found")) {
      return res.status(404).json({
        error: {
          code: "VIDEO_NOT_FOUND",
          message: "Video not found",
        },
      });
    }

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to get video",
      },
    });
  }
});

/**
 * GET /videos/:videoId/playback
 * Obtém URL de playback de um vídeo
 */
videoRouter.get("/:videoId/playback", async (req: Request, res: Response) => {
  try {
    const parsed = GetVideoParamsSchema.parse({
      videoId: req.params.videoId,
      provider: req.query.provider || VideoProvider.PANDA,
    });

    const videoProvider = VideoProviderFactory.create(parsed.provider);
    const playbackUrl = await videoProvider.getPlaybackUrl(parsed.videoId);

    return res.status(200).json({ playbackUrl });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error({ error: errorMessage, videoId: req.params.videoId }, "Error getting playback URL");
    
    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to get playback URL",
      },
    });
  }
});

/**
 * GET /videos/:videoId/embed
 * Obtém URL de embed de um vídeo
 */
videoRouter.get("/:videoId/embed", async (req: Request, res: Response) => {
  try {
    const parsed = GetVideoParamsSchema.parse({
      videoId: req.params.videoId,
      provider: req.query.provider || VideoProvider.PANDA,
    });

    const videoProvider = VideoProviderFactory.create(parsed.provider);
    const embedUrl = await videoProvider.getEmbedUrl(parsed.videoId);

    return res.status(200).json({ embedUrl });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error({ error: errorMessage, videoId: req.params.videoId }, "Error getting embed URL");
    
    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to get embed URL",
      },
    });
  }
});

