import { z } from "zod";
import { WEBHOOK_EVENTS } from "../../../domain/entities/Webhook";

export const CreateWebhookRequestSchema = z.object({
  name: z
    .string()
    .min(1, "Nome é obrigatório")
    .max(100, "Nome deve ter no máximo 100 caracteres"),
  url: z
    .string()
    .url("URL inválida")
    .refine(
      (url) => url.startsWith("http://") || url.startsWith("https://"),
      "URL deve começar com http:// ou https://"
    ),
  events: z
    .array(z.enum(WEBHOOK_EVENTS as unknown as [string, ...string[]]))
    .min(1, "Selecione pelo menos um evento")
    .max(10, "Máximo de 10 eventos por webhook"),
  devMode: z.boolean().optional().default(false),
});

export const UpdateWebhookRequestSchema = z.object({
  name: z
    .string()
    .min(1, "Nome é obrigatório")
    .max(100, "Nome deve ter no máximo 100 caracteres")
    .optional(),
  url: z
    .string()
    .url("URL inválida")
    .refine(
      (url) => url.startsWith("http://") || url.startsWith("https://"),
      "URL deve começar com http:// ou https://"
    )
    .optional(),
  events: z
    .array(z.enum(WEBHOOK_EVENTS as unknown as [string, ...string[]]))
    .min(1, "Selecione pelo menos um evento")
    .max(10, "Máximo de 10 eventos por webhook")
    .optional(),
  active: z.boolean().optional(),
});

export type CreateWebhookRequest = z.infer<typeof CreateWebhookRequestSchema>;
export type UpdateWebhookRequest = z.infer<typeof UpdateWebhookRequestSchema>;

