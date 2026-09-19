export type RutErrorCode = 'RUT_INVALIDO_FORMATO' | 'RUT_INVALIDO_DV'

export interface ValidarRutResult {
  ok: boolean
  normalizado: string
  error?: RutErrorCode
}

export function normalizarRut(input: string): string {
  return input.replace(/[.\s-]/g, '').toUpperCase()
}

function calcularDv(cuerpo: string): string {
  const pesos = [2, 3, 4, 5, 6, 7]
  let suma = 0
  for (let i = cuerpo.length - 1, p = 0; i >= 0; i--, p++) {
    suma += Number(cuerpo[i]) * pesos[p % pesos.length]
  }
  const resto = suma % 11
  const dv = 11 - resto
  if (dv === 11) return '0'
  if (dv === 10) return 'K'
  return String(dv)
}

export function validarRut(input: string): ValidarRutResult {
  const normalizado = normalizarRut(input)
  const cuerpo = normalizado.slice(0, -1)
  const dv = normalizado[normalizado.length - 1]

  if (!/^\d{1,8}[0-9K]$/.test(normalizado)) {
    return { ok: false, normalizado, error: 'RUT_INVALIDO_FORMATO' }
  }
  if (calcularDv(cuerpo) !== dv) {
    return { ok: false, normalizado, error: 'RUT_INVALIDO_DV' }
  }
  return { ok: true, normalizado: `${cuerpo}-${dv}` }
}