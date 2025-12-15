# Turbofy – Estratégia de Provedores de Vídeo

Centraliza regras para integrar provedores externos de vídeo através da `VideoProviderPort` (a ser criada).

---

## 1. Provedor Principal: Panda Video

O **Panda Video** é o provedor de vídeo oficial do Turbofy para hospedagem, streaming e gerenciamento de vídeos dos cursos.

### Configuração

- **API Key**: Configurada via variável de ambiente `PANDAS_APIKEY`
- **Base URL**: `https://api-v2.pandavideo.com.br`
- **Autenticação**: Header `Authorization` com o valor da API key
- **Documentação**: https://pandavideo.readme.io/

---

## 2. Endpoints Principais da API Panda Video

### 2.1. Gerenciamento de Vídeos

#### Listar Vídeos
- **Endpoint**: `GET https://api-v2.pandavideo.com.br/videos`
- **Query Params**:
  - `root_folder` (int32): 1 para retornar apenas vídeos da pasta raiz
  - `page` (int32): Número da página (opcional)
  - `limit` (int32): Máximo de vídeos por página (opcional)
  - `title` (string): Filtrar por título (opcional)
  - `status` (string): Filtrar por status (opcional)
  - `folder_id` (string): Filtrar por ID da pasta (opcional)
- **Respostas**:
  - `200`: Sucesso. Retorna todos os vídeos da conta
  - `400`: Bad request. Verifique os parâmetros
  - `401`: Unauthorized. Autenticação falhou ou não fornecida
  - `404`: Not found. Vídeos ou API não encontrados
  - `500`: Internal server error

#### Obter Propriedades de um Vídeo
- **Endpoint**: `GET https://api-v2.pandavideo.com.br/videos/{video_id}`
- **Parâmetros**:
  - `video_id` (string, required): ID do vídeo
- **Respostas**: `200`, `400`, `401`, `404`, `500`

#### Atualizar Propriedades de um Vídeo
- **Endpoint**: `PUT https://api-v2.pandavideo.com.br/videos/{video_id}`
- **Body Params**:
  - `title` (string): Título atualizado do vídeo
  - `description` (string): Descrição atualizada do vídeo
  - `folder_id` (string): ID da pasta para anexar o vídeo
  - `playback` (array of strings): Qualidades disponíveis: `["240p", "480p", "720p", "1080p", "1440p", "2160p"]`
- **Respostas**: `200`, `400`, `401`, `404`, `500`

#### Deletar Vídeo
- **Endpoint**: `DELETE https://api-v2.pandavideo.com.br/videos`
- **Body**: Array de objetos com `video_id`
- **Respostas**: `200`, `400`, `401`, `404`, `500`
- **Nota**: Vídeos deletados ficam disponíveis para recuperação por 30 dias

#### Recuperar Vídeo
- **Endpoint**: `POST https://api-v2.pandavideo.com.br/videos/recover`
- **Body**: Array de objetos com `video_id`
- **Respostas**: `200`, `400`
- **Nota**: Restaura vídeos que foram movidos para a lixeira

### 2.2. Upload de Vídeos

#### Listar Servidores de Upload
- **Endpoint**: `GET https://api-v2.pandavideo.com.br/hosts/uploader`
- **Respostas**: `200`, `400`
- **Nota**: Retorna lista de servidores de upload disponíveis (importante para escolher o servidor correto)

#### Upload Direto (Single Request)
- **Endpoint**: `POST https://uploader-{server}.pandavideo.com.br/files`
- **Protocolo**: TUS (Tus-Resumable: 1.0.0)
- **Headers**:
  - `Tus-Resumable`: `1.0.0` (obrigatório)
  - `Upload-Length`: Tamanho do arquivo em bytes
  - `Content-Type`: `application/offset+octet-stream`
  - `Upload-Metadata`: Metadados codificados em Base64
    - `authorization`: API key (Base64)
    - `folder_id`: ID da pasta (opcional)
    - `filename`: Nome do arquivo
    - `video_id`: UUID v4 (opcional)
- **Nota**: URL do uploader varia por servidor. Consultar lista de servidores primeiro.

#### Upload de Vídeo de URL Externa
- **Endpoint**: `POST https://import.pandavideo.com:9443/videos/`
- **Body Params**:
  - `url` (string, required): URL do vídeo hospedado na nuvem
  - `folder_id` (string): ID da pasta
  - `video_id` (string): UUID v4 recomendado
  - `title` (string): Título do vídeo
  - `description` (string): Descrição do vídeo
  - `size` (string): Tamanho do arquivo em bytes
- **Respostas**: `200`, `400`, `401`
- **Nota**: Retorna URL de WebSocket para acompanhar progresso. Apenas URLs de nuvem são aceitas.

#### Substituir Vídeo Existente
- **Endpoint**: `POST https://uploader-{server}.pandavideo.com.br/files` (mesmo do upload direto)
- **Metadata Adicional**:
  - `should_replace`: `true` ou `false`
  - `replace_video_options`: Opções de substituição (ver abaixo)
  - `replace_video_external_id`: ID externo para rastreamento
  - `replace_video_id`: ID do vídeo a ser substituído
- **Opções de Substituição**:
  - `regenerate_ai_keep_options`: Regenera recursos AI e mantém recursos adicionais
  - `regenerate_ai_remove_options`: Regenera recursos AI e descarta recursos adicionais
  - `keep_options`: Mantém recursos AI e recursos adicionais
  - `remove_config_options`: Mantém recursos AI mas descarta recursos adicionais
  - `remove_ai_options`: Descarta recursos AI mas mantém recursos adicionais
  - `remove_options`: Descarta ambos recursos AI e adicionais

### 2.3. Thumbnails

#### Obter Thumbnails do Vídeo
- **Endpoint**: `GET https://api-v2.pandavideo.com.br/videos/{video_id}/thumbs`
- **Respostas**: `200`, `400`, `401`, `404`, `500`

#### Upload de Thumbnail
- **Endpoint**: `POST https://api-v2.pandavideo.com.br/videos/{video_id}/thumbs`
- **Respostas**: `200`, `400`, `401`, `404`, `500`

#### Deletar Thumbnail
- **Endpoint**: `DELETE https://api-v2.pandavideo.com.br/videos/{video_id}/thumbs/{thumb_id}`
- **Respostas**: `200`, `400`, `401`, `404`, `500`

### 2.4. Subtítulos

#### Criar Subtítulos AI
- **Endpoint**: `POST https://api-v2.pandavideo.com.br/videos/{video_id}/subtitles/ai`
- **Respostas**: `200`, `400`, `401`, `404`, `500`

#### Adicionar Legenda ao Vídeo
- **Endpoint**: `POST https://api-v2.pandavideo.com.br/videos/{video_id}/subtitles`
- **Respostas**: `200`, `400`, `401`, `404`, `500`

#### Obter Legenda do Vídeo
- **Endpoint**: `GET https://api-v2.pandavideo.com.br/videos/{video_id}/subtitles/{subtitle_id}`
- **Respostas**: `200`, `400`, `401`, `404`, `500`

#### Obter Informações de Legendas
- **Endpoint**: `GET https://api-v2.pandavideo.com.br/videos/{video_id}/subtitles`
- **Respostas**: `200`, `400`, `401`, `404`, `500`

#### Remover Legenda
- **Endpoint**: `DELETE https://api-v2.pandavideo.com.br/videos/{video_id}/subtitles/{subtitle_id}`
- **Respostas**: `200`, `400`, `401`, `404`, `500`

### 2.5. Watermark (Marca d'água)

#### Habilitar Watermark
- **Endpoint**: `POST https://api-v2.pandavideo.com.br/videos/{video_id}/watermark`
- **Respostas**: `200`, `400`, `401`, `404`, `500`

#### Verificar se Watermark está Ativo
- **Endpoint**: `GET https://api-v2.pandavideo.com.br/videos/{video_id}/watermark`
- **Respostas**: `200`, `400`, `401`, `404`, `500`

#### Desabilitar Watermark
- **Endpoint**: `DELETE https://api-v2.pandavideo.com.br/videos/{video_id}/watermark`
- **Respostas**: `200`, `400`, `401`, `404`, `500`

### 2.6. Recursos AI

#### Mind Map, eBook e Quiz (AI)
- **Endpoint**: `GET https://api-v2.pandavideo.com.br/videos/{video_id}/ai/{type}`
- **Endpoint**: `POST https://api-v2.pandavideo.com.br/videos/{video_id}/ai`
- **Tipos**: `mindmap`, `ebook`, `quiz`

#### Dubbing (Dublagem AI)
- **Endpoint**: `POST https://api-v2.pandavideo.com.br/videos/{video_id}/dubbing`
- **Endpoint**: `GET https://api-v2.pandavideo.com.br/videos/{video_id}/dubbing/{dubbing_id}/download`

### 2.7. Pastas (Folders)

#### Listar Pastas
- **Endpoint**: `GET https://api-v2.pandavideo.com.br/folders`
- **Respostas**: `200`, `400`, `401`, `404`, `500`

#### Criar Nova Pasta
- **Endpoint**: `POST https://api-v2.pandavideo.com.br/folders`
- **Respostas**: `200`, `400`, `401`, `404`, `500`

#### Obter Detalhes da Pasta
- **Endpoint**: `GET https://api-v2.pandavideo.com.br/folders/{folder_id}`
- **Respostas**: `200`, `400`, `401`, `404`, `500`

#### Atualizar Pasta
- **Endpoint**: `PUT https://api-v2.pandavideo.com.br/folders/{folder_id}`
- **Respostas**: `200`, `400`, `401`, `404`, `500`

#### Deletar Pasta
- **Endpoint**: `DELETE https://api-v2.pandavideo.com.br/folders/{folder_id}`
- **Respostas**: `200`, `400`, `401`, `404`, `500`

### 2.8. Player

O Panda Video fornece um player embutido com suporte a:
- Eventos de player (play, pause, progress, etc.)
- Query params customizados
- Analytics integrado
- Qualidades adaptativas

**Documentação do Player**: Ver seção "Player" na documentação oficial.

### 2.9. Analytics

#### Analytics em Tempo Real
- **Endpoint**: `GET https://api-v2.pandavideo.com.br/analytics/realtime`

#### Analytics Gerais
- **Endpoint**: `GET https://api-v2.pandavideo.com.br/analytics/general`
- **Endpoint**: `GET https://api-v2.pandavideo.com.br/analytics/videos/{video_id}/general`

#### Analytics de Retenção
- **Endpoint**: `GET https://api-v2.pandavideo.com.br/analytics/retention`
- **Endpoint**: `GET https://api-v2.pandavideo.com.br/analytics/videos/{video_id}/retention`

#### Analytics Geográficos
- **Endpoint**: `GET https://api-v2.pandavideo.com.br/analytics/countries`
- **Endpoint**: `GET https://api-v2.pandavideo.com.br/analytics/videos/{video_id}/countries`

#### Analytics de Bandwidth
- **Endpoint**: `GET https://api-v2.pandavideo.com.br/analytics/bandwidth`
- **Endpoint**: `GET https://api-v2.pandavideo.com.br/analytics/videos/{video_id}/bandwidth`

### 2.10. Webhooks

#### Obter Informações de Webhook
- **Endpoint**: `GET https://api-v2.pandavideo.com.br/webhooks`
- **Respostas**: `200`, `400`, `401`, `404`, `500`

#### Criar ou Substituir Webhook
- **Endpoint**: `POST https://api-v2.pandavideo.com.br/webhooks`
- **Respostas**: `200`, `400`, `401`, `404`, `500`

#### Deletar Webhook
- **Endpoint**: `DELETE https://api-v2.pandavideo.com.br/webhooks/{webhook_id}`
- **Respostas**: `200`, `400`, `401`, `404`, `500`

---

## 3. Integração no Turbofy

### 3.1. Enum VideoProvider

O enum `VideoProvider` deve incluir `PANDA`:

```typescript
export enum VideoProvider {
  PANDA = "PANDA",
  BUNNY = "BUNNY",
  VIMEO = "VIMEO",
  YOUTUBE = "YOUTUBE",
}
```

### 3.2. Variável de Ambiente

Adicionar ao `.env` e ao schema de validação (`backend/src/config/env.ts`):

```env
PANDAS_APIKEY=your_api_key_here
```

### 3.3. Port (Interface) - A Criar

```typescript
export interface VideoProviderPort {
  listVideos(params?: ListVideosParams): Promise<Video[]>;
  getVideo(videoId: string): Promise<Video>;
  updateVideo(videoId: string, data: UpdateVideoData): Promise<Video>;
  deleteVideos(videoIds: string[]): Promise<void>;
  recoverVideos(videoIds: string[]): Promise<void>;
  uploadVideo(file: Buffer | Stream, metadata: UploadMetadata): Promise<Video>;
  uploadVideoFromUrl(url: string, metadata: UploadMetadata): Promise<Video>;
  getThumbnails(videoId: string): Promise<Thumbnail[]>;
  uploadThumbnail(videoId: string, file: Buffer | Stream): Promise<Thumbnail>;
  deleteThumbnail(videoId: string, thumbnailId: string): Promise<void>;
  createSubtitles(videoId: string, language: string): Promise<Subtitle>;
  getSubtitles(videoId: string): Promise<Subtitle[]>;
  deleteSubtitle(videoId: string, subtitleId: string): Promise<void>;
  listFolders(): Promise<Folder[]>;
  createFolder(name: string): Promise<Folder>;
  // ... outros métodos conforme necessário
}
```

### 3.4. Adapter - A Criar

Criar `backend/src/infrastructure/adapters/video/PandaVideoAdapter.ts` que implementa `VideoProviderPort`.

**Características**:
- Usar `PANDAS_APIKEY` do `env`
- Base URL: `https://api-v2.pandavideo.com.br`
- Header `Authorization` com a API key
- Tratamento de erros mapeado para erros de domínio
- Logs estruturados (não expor API key)
- Retry logic para operações críticas
- Timeouts configuráveis

### 3.5. Factory - A Criar

Criar `backend/src/infrastructure/adapters/video/VideoProviderFactory.ts`:

```typescript
export class VideoProviderFactory {
  static create(): VideoProviderPort {
    // Por enquanto, apenas Panda Video
    return new PandaVideoAdapter();
  }
}
```

---

## 4. Boas Práticas

### 4.1. Autenticação
- **NUNCA** expor a API key em logs ou respostas
- Sempre validar a presença da API key no `env` antes de usar
- Usar header `Authorization` em todas as requisições

### 4.2. Upload de Vídeos
- Sempre consultar lista de servidores de upload antes de fazer upload
- Usar protocolo TUS para uploads grandes (suporta retomada)
- Para uploads de URL externa, validar que a URL é acessível e aponta para um arquivo de vídeo válido

### 4.3. Tratamento de Erros
- Mapear códigos HTTP do Panda Video para erros de domínio
- Implementar retry logic para erros temporários (5xx)
- Logar erros com contexto (videoId, traceId) mas sem dados sensíveis

### 4.4. Performance
- Usar paginação ao listar vídeos
- Cachear informações de vídeo quando apropriado
- Usar WebSockets para acompanhar progresso de uploads longos

### 4.5. Webhooks
- Validar assinatura de webhooks (quando disponível)
- Processar eventos de forma idempotente
- Registrar eventos em `PaymentInteractions` quando relevante

---

## 5. Variáveis de Ambiente

```env
# Panda Video API
PANDAS_APIKEY=your_panda_video_api_key_here
```

**Validação**: Adicionar ao schema em `backend/src/config/env.ts`:

```typescript
PANDAS_APIKEY: z.string().nonempty("PANDAS_APIKEY is required"),
```

---

## 6. Testes

### 6.1. Testes Unitários
- Mockar chamadas HTTP para a API do Panda Video
- Testar mapeamento de erros
- Testar validação de parâmetros

### 6.2. Testes de Integração
- Usar conta de teste do Panda Video
- Testar fluxos completos (upload, listagem, atualização)
- Validar tratamento de erros reais

### 6.3. Stub para Desenvolvimento
- Criar `StubVideoProviderAdapter` para desenvolvimento local sem API key
- Retornar dados mockados que sigam a estrutura esperada

---

## 7. Próximos Passos

1. ✅ Adicionar `PANDA` ao enum `VideoProvider`
2. ✅ Atualizar schema Prisma para incluir `PANDA`
3. ✅ Adicionar `PANDAS_APIKEY` ao schema de env
4. ⏳ Criar `VideoProviderPort` interface
5. ⏳ Criar `PandaVideoAdapter` implementando a port
6. ⏳ Criar `VideoProviderFactory`
7. ⏳ Integrar com casos de uso de criação/atualização de aulas
8. ⏳ Implementar webhook handler para eventos do Panda Video
9. ⏳ Adicionar testes unitários e de integração

---

## 8. Referências

- **Documentação Oficial**: https://pandavideo.readme.io/
- **API Base URL**: https://api-v2.pandavideo.com.br
- **Protocolo TUS**: https://tus.io/

---

Atualize este arquivo sempre que novos endpoints ou funcionalidades do Panda Video forem integrados.

