/**
 * Utilities para gerenciamento de roles do Better Auth
 * 
 * O Better Auth armazena múltiplos roles como string separada por vírgula.
 * Estas funções facilitam a conversão entre string e array.
 * 
 * @example
 * const roles = parseRoles("OWNER,ADMIN"); // ["OWNER", "ADMIN"]
 * const hasOwner = hasRole("OWNER,ADMIN", ["OWNER"]); // true
 * const roleStr = rolesToString(["OWNER", "ADMIN"]); // "OWNER,ADMIN"
 */

/**
 * Converte string de roles do Better Auth para array
 * 
 * @param role - String de roles separados por vírgula (ex: "OWNER,ADMIN")
 * @returns Array de roles em uppercase
 */
export const parseRoles = (role: string | null | undefined): string[] => {
  if (!role) return [];
  return role.split(',').map(r => r.trim().toUpperCase()).filter(Boolean);
};

/**
 * Verifica se o usuário possui pelo menos um dos roles requeridos
 * 
 * @param userRole - String de roles do usuário (ex: "OWNER,ADMIN")
 * @param requiredRoles - Array de roles requeridos
 * @returns true se o usuário possui pelo menos um dos roles
 */
export const hasRole = (
  userRole: string | null | undefined,
  requiredRoles: string[]
): boolean => {
  const roles = parseRoles(userRole);
  return requiredRoles.some(r => roles.includes(r.toUpperCase()));
};

/**
 * Converte array de roles para string do Better Auth
 * 
 * @param roles - Array de roles
 * @returns String de roles separados por vírgula em uppercase
 */
export const rolesToString = (roles: string[]): string => {
  return roles.map(r => r.trim().toUpperCase()).filter(Boolean).join(',');
};

/**
 * Adiciona um role ao usuário (se ainda não tiver)
 * 
 * @param userRole - String de roles atual
 * @param newRole - Novo role a adicionar
 * @returns Nova string de roles
 */
export const addRole = (
  userRole: string | null | undefined,
  newRole: string
): string => {
  const roles = parseRoles(userRole);
  const normalizedNewRole = newRole.toUpperCase();
  
  if (!roles.includes(normalizedNewRole)) {
    roles.push(normalizedNewRole);
  }
  
  return rolesToString(roles);
};

/**
 * Remove um role do usuário
 * 
 * @param userRole - String de roles atual
 * @param roleToRemove - Role a remover
 * @returns Nova string de roles
 */
export const removeRole = (
  userRole: string | null | undefined,
  roleToRemove: string
): string => {
  const roles = parseRoles(userRole);
  const normalizedRoleToRemove = roleToRemove.toUpperCase();
  
  const filteredRoles = roles.filter(r => r !== normalizedRoleToRemove);
  
  return rolesToString(filteredRoles);
};
