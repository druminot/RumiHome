export type ReservationStatus = 'pendiente' | 'confirmada' | 'cancelada' | 'finalizada'

export interface Property {
  id: number
  name: string
  address: string
  max_guests: number
  base_price_per_night: number | null
  active: number
}

export interface Reservation {
  id: number
  pnr: string
  property_id: number
  guest_name: string
  guest_rut: string
  guest_email?: string | null
  guest_phone?: string | null
  arrival_time?: string | null
  check_in: string
  check_out: string
  guests: number
  price_per_night: number | null
  total_price: number | null
  status: ReservationStatus
  notes?: string | null
  created_at: string
  updated_at: string
}

export interface NewReservation {
  property_id: number
  guest_name: string
  guest_rut: string
  guest_email?: string
  guest_phone?: string
  arrival_time?: string
  check_in: string
  check_out: string
  guests: number
  price_per_night?: number | null
  notes?: string
}

export interface Stats {
  month_income: number
  upcoming_checkins: number
  active_reservations: number
  occupancy_percent: number
  next_checkin: { pnr: string; guest_name: string; check_in: string; property_name: string } | null
}

export interface CalendarDay {
  date: string
  status: 'libre' | 'parcial' | 'ocupado'
  pnr?: string
  guest_name?: string
}

export interface GuestReservationView {
  pnr: string
  property_name: string
  guest_name: string
  guest_rut: string
  check_in: string
  check_out: string
  guests: number
  nights: number
  price_per_night: number | null
  total_price: number | null
  status: ReservationStatus
  notes?: string | null
  guest_email?: string | null
  guest_phone?: string | null
  arrival_time?: string | null
}