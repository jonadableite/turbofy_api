/**
 * Factory para criar instâncias de VideoProviderPort
 * Escolhe entre diferentes provedores baseado na configuração
 * 
 * @maintainability Centraliza a lógica de escolha do provider
 * @testability Facilita mock em testes
 */

import { VideoProviderPort } from "../../../ports/VideoProviderPort";
import { PandaVideoAdapter } from "./PandaVideoAdapter";
import { VideoProvider } from "../../../domain/entities/Lesson";
import { env } from "../../../config/env";
import { logger } from "../../logger";

export class VideoProviderFactory {
  /**
   * Cria uma instância do VideoProviderPort baseado no provider especificado
   */
  static create(provider: VideoProvider): VideoProviderPort {
    switch (provider) {
      case VideoProvider.PANDA:
        try {
          return new PandaVideoAdapter();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Unknown error";
          logger.error(
            { error: errorMessage },
            "Failed to create PandaVideoAdapter, check PANDAS_APIKEY configuration"
          );
          throw new Error(`Failed to create Panda Video adapter: ${errorMessage}`);
        }

      case VideoProvider.BUNNY:
        // TODO: Implementar BunnyAdapter
        throw new Error("Bunny adapter not yet implemented");

      case VideoProvider.VIMEO:
        // TODO: Implementar VimeoAdapter
        throw new Error("Vimeo adapter not yet implemented");

      case VideoProvider.YOUTUBE:
        // TODO: Implementar YouTubeAdapter
        throw new Error("YouTube adapter not yet implemented");

      default:
        throw new Error(`Unknown video provider: ${provider}`);
    }
  }

  /**
   * Cria o provedor padrão (Panda Video)
   */
  static createDefault(): VideoProviderPort {
    return this.create(VideoProvider.PANDA);
  }
}

