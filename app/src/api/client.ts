const API = '/api'

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error ?? `Error ${res.status}`)
  }
  return res.json()
}

/** Adjunta el token de Firebase si está configurado (modo desarrollo lo omite). */
async function authHeaders(): Promise<Record<string, string>> {
  const { getIdToken } = await import('../firebase')
  const token = await getIdToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export const api = {
  async listReservations(): Promise<Reservation[]> {
    return request('/reservations', { headers: await authHeaders() })
  },
  async createReservation(data: NewReservation): Promise<Reservation> {
    return request('/reservations', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(data),
    })
  },
  async updateReservation(id: number, data: Partial<NewReservation> & { status?: string }): Promise<Reservation> {
    return request(`/reservations/${id}`, {
      method: 'PATCH',
      headers: await authHeaders(),
      body: JSON.stringify(data),
    })
  },
  async deleteReservation(id: number): Promise<void> {
    return request(`/reservations/${id}`, {
      method: 'DELETE',
      headers: await authHeaders(),
    })
  },
  /** Portal del pasajero: busca por nombre + RUT + PNR. */
  async guestLookup(pnr: string, name: string, rut: string): Promise<Reservation> {
    return request('/guest/lookup', {
      method: 'POST',
      body: JSON.stringify({ pnr, name, rut }),
    })
  },
  async guestReservation(pnr: string, name: string, rut: string): Promise<Reservation> {
    return request('/guest/reservation', {
      method: 'POST',
      body: JSON.stringify({ pnr, name, rut }),
    })
  },
}

import type { Reservation, NewReservation } from '../types'