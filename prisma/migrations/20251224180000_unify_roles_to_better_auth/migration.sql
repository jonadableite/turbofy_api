-- Migration: Unificar sistema de roles para usar apenas role do Better Auth
--
-- IMPORTANTE: Esta migration assume que:
-- 1. O campo role já existe na tabela User (criado pelo Better Auth)
-- 2. O campo roles (array) ainda existe e precisa ser removido
-- 3. O enum UserRole ainda existe e precisa ser removido
--
-- Executar manualmente quando o banco estiver disponível:
-- psql -h painel.whatlead.com.br -p 5436 -U <user> -d turbofy < thisfile.sql

-- Passo 1: Migrar dados existentes de roles[] para role (string separada por vírgula)
DO $$
DECLARE
  user_record RECORD;
  roles_array TEXT[];
  roles_string TEXT;
BEGIN
  FOR user_record IN SELECT id, roles, role FROM "User" WHERE roles IS NOT NULL
  LOOP
    -- Converter array de roles para string separada por vírgula
    SELECT array_to_string(user_record.roles::TEXT[], ',') INTO roles_string;
    
    -- Atualizar role se estiver vazio ou for o default do Better Auth
    IF user_record.role IS NULL OR user_record.role = 'user' THEN
      UPDATE "User" 
      SET role = COALESCE(roles_string, 'BUYER')
      WHERE id = user_record.id;
    END IF;
  END LOOP;
END $$;

-- Passo 2: Garantir que todos os usuários tenham role
UPDATE "User"
SET role = 'BUYER'
WHERE role IS NULL OR role = '';

-- Passo 3: Remover a coluna roles (array)
ALTER TABLE "User" DROP COLUMN IF EXISTS roles;

-- Passo 4: Remover o enum UserRole
DROP TYPE IF EXISTS "UserRole";

-- Nota: O campo role do Better Auth agora armazena múltiplos roles separados por vírgula
-- Exemplo: "OWNER,ADMIN" ou "BUYER"
