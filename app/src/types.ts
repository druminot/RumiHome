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
  door_code?: string | null
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
  door_code?: string
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
  door_code?: string | null
  status: ReservationStatus
  notes?: string | null
  guest_email?: string | null
  guest_phone?: string | null
  arrival_time?: string | null
}

/* ============ Finanzas ============ */

export type ExpenseCategory = 'servicios' | 'mantencion' | 'comision' | 'insumos' | 'otro'

export interface Expense {
  id: number
  property_id: number
  category: ExpenseCategory
  subcategory: string | null
  amount: number
  expense_date: string
  vendor: string | null
  description: string | null
  created_at: string
}

export interface NewExpense {
  property_id: number
  category: ExpenseCategory
  subcategory?: string
  amount: number
  expense_date: string
  vendor?: string
  description?: string
}

export type SupermarketUnit = 'un' | 'kg' | 'lt'

export interface SupermarketItemInput {
  product: string
  quantity: number
  unit: SupermarketUnit
  unit_price: number
}

export interface SupermarketPurchase {
  id: number
  property_id: number
  purchase_date: string
  store: string
  total: number
  item_count: number
  created_at: string
}

export interface SupermarketItem {
  id: number
  purchase_id: number
  product: string
  quantity: number
  unit: SupermarketUnit
  unit_price: number
  subtotal: number
}

export type SocialPlatform = 'instagram' | 'facebook' | 'whatsapp' | 'airbnb' | 'booking' | 'otro'

export interface SocialStat {
  id: number
  platform: SocialPlatform
  stat_date: string
  ad_spend: number
  reach: number
  conversations: number
  bookings: number
  notes: string | null
  created_at: string
}

export interface NewSocialStat {
  platform: SocialPlatform
  stat_date: string
  ad_spend?: number
  reach?: number
  conversations?: number
  bookings?: number
  notes?: string
}

export interface FinanceAnalytics {
  month: string
  income: number
  expenses_by_category: { category: string; total: number }[]
  supermarket_total: number
  ad_spend_total: number
  expenses_total: number
  net: number
  top_products: { product: string; total: number; times: number }[]
  social_by_platform: {
    platform: string
    ad_spend: number
    reach: number
    conversations: number
    bookings: number
  }[]
  monthly_series: { month: string; income: number; expenses: number }[]
}

/* ============ Domótica ============ */

export type SmartDeviceType = 'luz' | 'llave' | 'presencia' | 'calefaccion' | 'tv' | 'energia'

export interface SmartDevice {
  id: number
  property_id: number
  name: string
  type: SmartDeviceType
  room: string | null
  api_key: string
  active: number
  last_seen: string | null
  created_at: string
}

export interface StayUsageRow {
  reservation_id: number
  pnr: string
  guest_name: string
  check_in: string
  check_out: string
  property_name: string
  kwh: number
  cost_clp: number
}

export interface SmartHomeSummary {
  devices: { id: number; name: string; type: SmartDeviceType; room: string | null; last_seen: string | null }[]
  energy_daily: { date: string; kwh_guest: number; kwh_admin: number }[]
  device_usage: { name: string; type: string; minutes_on: number; kwh: number }[]
  key_events: { event_at: string; event_type: string; detail: string | null; device: string }[]
  stays_usage: StayUsageRow[]
  admin_usage: { kwh: number; days: number; avg_kwh_day: number | null }
  kwh_price: number
}

export interface StayUsageDetail {
  reservation: { id: number; pnr: string; guest_name: string; check_in: string; check_out: string; property_name: string }
  kwh: number
  cost_clp: number
  hourly_profile: { hour: number; kwh: number }[]
  device_usage: { name: string; type: string; minutes_on: number; kwh: number }[]
  key_events: { event_at: string; event_type: string; detail: string | null; device: string }[]
}