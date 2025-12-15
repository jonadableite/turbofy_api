# 🚀 Setup do Repositório GitHub

## Passo a Passo para Criar o Repositório Remoto

### 1. Criar Repositório no GitHub

1. Acesse [GitHub](https://github.com/new)
2. Crie um novo repositório (ex: `turbofy-api-backend`)
3. **NÃO** inicialize com README, .gitignore ou license (já temos tudo)
4. Clique em "Create repository"

### 2. Conectar Repositório Local ao Remoto

Execute os seguintes comandos no diretório `api/`:

```bash
cd /Users/jonadableite/Documents/turbofy/api

# Adicionar remote (substitua SEU_USUARIO e NOME_DO_REPO)
git remote add origin https://github.com/SEU_USUARIO/NOME_DO_REPO.git

# Ou usando SSH (se preferir)
# git remote add origin git@github.com:SEU_USUARIO/NOME_DO_REPO.git

# Verificar remote configurado
git remote -v
```

### 3. Push para o GitHub

```bash
# Fazer push do branch main
git push -u origin main
```

### 4. Configurar Branch Padrão (se necessário)

Se o GitHub criou o branch como `master`:

```bash
# Renomear branch local para main (se necessário)
git branch -M main

# Push novamente
git push -u origin main
```

## 📝 Próximos Passos

Após o push:

1. **Configurar EasyPanel**:
   - Use a URL do repositório GitHub
   - Context: `.` (raiz do repositório)
   - Dockerfile: `./Dockerfile`
   - Branch: `main`

2. **Configurar GitHub Actions** (opcional):
   - O arquivo `.github/workflows/ci.yml` já está configurado
   - Actions serão executadas automaticamente em push/PR

3. **Adicionar Secrets no GitHub** (se usar Actions):
   - Vá em Settings > Secrets and variables > Actions
   - Adicione `DATABASE_URL` e outras variáveis necessárias

## 🔗 Comandos Úteis

```bash
# Ver status do repositório
git status

# Ver histórico de commits
git log --oneline

# Adicionar arquivos novos/modificados
git add .

# Commit
git commit -m "feat: descrição da mudança"

# Push
git push

# Ver branches
git branch -a
```

## ✅ Checklist Final

- [ ] Repositório criado no GitHub
- [ ] Remote configurado localmente
- [ ] Push inicial realizado
- [ ] Branch `main` configurado como padrão
- [ ] EasyPanel configurado com novo repositório

