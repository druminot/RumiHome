export type ReservationStatus = 'pendiente' | 'confirmada' | 'cancelada' | 'finalizada'

export interface Reservation {
  id: number
  pnr: string
  guest_name: string
  guest_rut: string
  guest_email?: string
  guest_phone?: string
  check_in: string
  check_out: string
  guests: number
  status: ReservationStatus
  notes?: string
  created_at: string
  updated_at: string
}

export interface NewReservation {
  guest_name: string
  guest_rut: string
  guest_email?: string
  guest_phone?: string
  check_in: string
  check_out: string
  guests: number
  notes?: string
}