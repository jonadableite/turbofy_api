export function onlyDigits(input: string): string {
  return input.replace(/\D/g, '');
}

export function validateCpf(raw: string): boolean {
  const cpf = onlyDigits(raw);
  if (!cpf || cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(cpf[i], 10) * (10 - i);
  let first = (sum * 10) % 11;
  if (first === 10 || first === 11) first = 0;
  if (first !== parseInt(cpf[9], 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(cpf[i], 10) * (11 - i);
  let second = (sum * 10) % 11;
  if (second === 10 || second === 11) second = 0;
  return second === parseInt(cpf[10], 10);
}

export function validateCnpj(raw: string): boolean {
  const cnpj = onlyDigits(raw);
  if (!cnpj || cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (base: number[]) => {
    let size = base.length;
    let pos = size - 7;
    let sum = 0;
    for (let i = size; i >= 1; i--) {
      sum += base[size - i] * pos--;
      if (pos < 2) pos = 9;
    }
    const res = sum % 11;
    return res < 2 ? 0 : 11 - res;
  };
  const numbers = cnpj.split('').map((n) => parseInt(n, 10));
  const first = calc(numbers.slice(0, 12));
  if (first !== numbers[12]) return false;
  const second = calc(numbers.slice(0, 13));
  return second === numbers[13];
}