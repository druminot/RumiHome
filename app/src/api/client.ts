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
  async listProperties(): Promise<Property[]> {
    return request('/properties', { headers: await authHeaders() })
  },
  async getStats(propertyId?: number): Promise<Stats> {
    const q = propertyId ? `?property_id=${propertyId}` : ''
    return request(`/stats${q}`, { headers: await authHeaders() })
  },
  async getCalendar(propertyId: number, year: number, month: number): Promise<{ days: CalendarDay[] }> {
    return request(`/calendar/${propertyId}/${year}/${month}`, { headers: await authHeaders() })
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
  async guestLookup(pnr: string, name: string, rut: string): Promise<GuestReservationView> {
    return request('/guest/lookup', {
      method: 'POST',
      body: JSON.stringify({ pnr, name, rut }),
    })
  },
  async guestReservation(pnr: string, name: string, rut: string): Promise<GuestReservationView> {
    return request('/guest/reservation', {
      method: 'POST',
      body: JSON.stringify({ pnr, name, rut }),
    })
  },
  /** Check-in online: el pasajero completa email/teléfono/hora de llegada. */
  async guestCheckIn(
    pnr: string,
    name: string,
    rut: string,
    data: { guest_email?: string; guest_phone?: string; arrival_time?: string },
  ): Promise<GuestReservationView> {
    return request('/guest/reservation', {
      method: 'PATCH',
      body: JSON.stringify({ pnr, name, rut, ...data }),
    })
  },

  /* ============ Finanzas ============ */

  async listExpenses(from?: string, to?: string): Promise<Expense[]> {
    const q = from || to ? `?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString()}` : ''
    return request(`/expenses${q}`, { headers: await authHeaders() })
  },
  async createExpense(data: NewExpense): Promise<Expense> {
    return request('/expenses', { method: 'POST', headers: await authHeaders(), body: JSON.stringify(data) })
  },
  async deleteExpense(id: number): Promise<void> {
    return request(`/expenses/${id}`, { method: 'DELETE', headers: await authHeaders() })
  },
  async listPurchases(from?: string, to?: string): Promise<SupermarketPurchase[]> {
    const q = from || to ? `?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString()}` : ''
    return request(`/supermarket${q}`, { headers: await authHeaders() })
  },
  async createPurchase(data: { property_id: number; purchase_date: string; store: string; items: SupermarketItemInput[] }): Promise<SupermarketPurchase> {
    return request('/supermarket', { method: 'POST', headers: await authHeaders(), body: JSON.stringify(data) })
  },
  async getPurchaseItems(purchaseId: number): Promise<SupermarketItem[]> {
    return request(`/supermarket/${purchaseId}/items`, { headers: await authHeaders() })
  },
  async deletePurchase(id: number): Promise<void> {
    return request(`/supermarket/${id}`, { method: 'DELETE', headers: await authHeaders() })
  },
  async listProducts(): Promise<string[]> {
    return request('/supermarket/products', { headers: await authHeaders() })
  },
  async listSocialStats(from?: string, to?: string): Promise<SocialStat[]> {
    const q = from || to ? `?${new URLSearchParams({ ...(from ? { from } : {}), ...(to ? { to } : {}) }).toString()}` : ''
    return request(`/social${q}`, { headers: await authHeaders() })
  },
  async createSocialStat(data: NewSocialStat): Promise<SocialStat> {
    return request('/social', { method: 'POST', headers: await authHeaders(), body: JSON.stringify(data) })
  },
  async deleteSocialStat(id: number): Promise<void> {
    return request(`/social/${id}`, { method: 'DELETE', headers: await authHeaders() })
  },
  async getFinanceAnalytics(month: string, propertyId?: number): Promise<FinanceAnalytics> {
    const q = propertyId ? `&property_id=${propertyId}` : ''
    return request(`/analytics/finance?month=${month}${q}`, { headers: await authHeaders() })
  },

  /* ============ Domótica ============ */

  async listSmartDevices(): Promise<SmartDevice[]> {
    return request('/smarthome/devices', { headers: await authHeaders() })
  },
  async createSmartDevice(data: { property_id: number; name: string; type: SmartDeviceType; room?: string }): Promise<SmartDevice> {
    return request('/smarthome/devices', { method: 'POST', headers: await authHeaders(), body: JSON.stringify(data) })
  },
  async deleteSmartDevice(id: number): Promise<void> {
    return request(`/smarthome/devices/${id}`, { method: 'DELETE', headers: await authHeaders() })
  },
  async rotateApiKey(id: number): Promise<SmartDevice> {
    return request(`/smarthome/devices/${id}/rotate`, { method: 'POST', headers: await authHeaders() })
  },
  async getSmartHomeSummary(days = 7, propertyId?: number): Promise<SmartHomeSummary> {
    const q = new URLSearchParams({ days: String(days), ...(propertyId ? { property_id: String(propertyId) } : {}) }).toString()
    return request(`/smarthome/summary?${q}`, { headers: await authHeaders() })
  },
}

import type { Reservation, NewReservation, Property, Stats, CalendarDay, GuestReservationView, Expense, NewExpense, SupermarketPurchase, SupermarketItem, SupermarketItemInput, SocialStat, NewSocialStat, FinanceAnalytics, SmartDevice, SmartDeviceType, SmartHomeSummary } from '../types'