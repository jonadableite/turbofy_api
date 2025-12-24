-- AlterTable: Remove duplicate 'role' field from User table
-- The Turbofy system uses the 'roles' (UserRole[]) array field instead
-- of the singular 'role' field added by Better Auth Admin Plugin

ALTER TABLE "User" DROP COLUMN IF EXISTS "role";
