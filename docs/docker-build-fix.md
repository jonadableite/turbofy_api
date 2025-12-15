# Correção do Build Docker - TypeScript não encontra dependências

## Problema

Durante o build Docker, o TypeScript não consegue encontrar os módulos instalados pelo pnpm workspace, gerando erros como:

```
error TS2307: Cannot find module '@prisma/client' or its corresponding type declarations.
error TS2307: Cannot find module 'express' or its corresponding type declarations.
error TS2307: Cannot find module 'zod' or its corresponding type declarations.
```

## Causa Raiz

O problema ocorre porque:

1. **pnpm workspace** instala dependências em `node_modules` na raiz do monorepo
2. O TypeScript precisa ser executado no contexto correto do workspace
3. O `tsconfig.build.json` precisa estar configurado para encontrar os módulos na raiz

## Solução Implementada

### 1. Ajuste do `tsconfig.build.json`

Removida a extensão de `node.json` que usa `moduleResolution: "node16"` e configurado explicitamente para usar `moduleResolution: "node"` que funciona melhor com pnpm workspaces:

```json
{
  "compilerOptions": {
    "moduleResolution": "node",
    "module": "commonjs",
    "typeRoots": ["../../node_modules/@types", "./node_modules/@types"],
    // ... outras opções
  }
}
```

### 2. Ajuste do Dockerfile

O Dockerfile agora executa o TypeScript diretamente no diretório `apps/api` usando o caminho completo do `tsc`:

```dockerfile
RUN cd apps/api && \
    ../../node_modules/.bin/tsc -p tsconfig.build.json
```

Isso garante que:
- O TypeScript seja executado no diretório correto
- Os `node_modules` na raiz sejam encontrados corretamente
- O Prisma Client gerado seja encontrado

### 3. Script `build:docker` no package.json

Criado script específico para Docker que apenas compila TypeScript (sem tentar gerar Prisma novamente):

```json
{
  "scripts": {
    "build:docker": "tsc -p tsconfig.build.json"
  }
}
```

## Ordem de Execução no Dockerfile

1. **Instalar dependências**: `pnpm install --frozen-lockfile --prefer-offline`
2. **Gerar Prisma Client**: `pnpm --filter api exec prisma generate`
3. **Buildar packages compartilhados**: `pnpm turbo run build --filter='@turbofy/shared' --filter='@turbofy/casl'`
4. **Compilar TypeScript**: `cd apps/api && ../../node_modules/.bin/tsc -p tsconfig.build.json`

## Verificação

Para verificar se o build funciona localmente:

```bash
# Gerar Prisma Client
pnpm --filter api exec prisma generate --schema=./prisma/schema.prisma

# Compilar TypeScript
cd apps/api && ../../node_modules/.bin/tsc -p tsconfig.build.json
```

## Notas Importantes

- O Prisma Client **deve** ser gerado antes da compilação TypeScript
- Os packages compartilhados (`@turbofy/shared`, `@turbofy/casl`) **devem** ser buildados antes da API
- O TypeScript **deve** ser executado no diretório `apps/api` para resolução correta de módulos
- O `moduleResolution: "node"` funciona melhor com pnpm workspaces do que `"node16"` ou `"nodenext"`
