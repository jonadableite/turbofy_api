declare module "swagger-jsdoc" {
  interface SwaggerDefinition {
    openapi?: string;
    swagger?: string;
    info: {
      title: string;
      version: string;
      description?: string;
    };
    servers?: Array<{
      url: string;
      description?: string;
    }>;
    components?: Record<string, unknown>;
    paths?: Record<string, unknown>;
    tags?: Array<{
      name: string;
      description?: string;
    }>;
  }

  interface SwaggerOptions {
    definition: SwaggerDefinition;
    apis: string[];
  }

  function swaggerJSDoc(options: SwaggerOptions): unknown;

  export = swaggerJSDoc;
}

