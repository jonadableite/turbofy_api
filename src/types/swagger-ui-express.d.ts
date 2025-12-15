declare module "swagger-ui-express" {
  import { RequestHandler } from "express";

  interface SwaggerUiOptions {
    customCss?: string;
    customCssUrl?: string;
    customJs?: string;
    customSiteTitle?: string;
    swaggerOptions?: Record<string, unknown>;
  }

  export function setup(
    swaggerDoc: unknown,
    options?: SwaggerUiOptions
  ): RequestHandler[];

  export function serve(
    filesOrOptions?: unknown[] | SwaggerUiOptions
  ): RequestHandler[];

  export function serveFiles(
    swaggerDoc: unknown,
    options?: SwaggerUiOptions
  ): RequestHandler[];
}

