export interface UserPayload {
  id: string;
  email?: string;
  roles?: string[];
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface StationCreatedEvent {
  eventType: 'STATION_CREATED';
  data: { id: string; name: string; code: string; city: string; state?: string | null };
  timestamp: string;
}

export interface ScheduleCreatedEvent {
  scheduleId: string;
  trainId: string;
  trainNumber: string;
  trainName: string;
  coachName?: string;
  totalSeats?: number;
  departureDate: string;
  status: string;
  seats: Array<{ seatId: string; seatNumber: number; seatType: string; price: number }>;
  route?: Array<{
    stationId: string;
    stationName: string;
    stationCode: string;
    city?: string;
    sequenceNumber: number;
    arrivalTime?: string | null;
    departureTime?: string | null;
    distanceFromOrigin?: number;
  }>;
}

export interface SeatAvailabilityUpdatedEvent {
  scheduleId: string;
  trainId: string;
  available: number;
  locked: number;
  booked: number;
  timestamp: string;
}

export interface PaymentSuccessEvent {
  paymentOrderId: string;
  bookingId: string;
  gatewayPaymentId: string;
  amount: number;
  timestamp: string;
}

export interface PaymentFailedEvent {
  paymentOrderId: string;
  bookingId: string;
  reason: string;
  timestamp: string;
}

export interface BookingConfirmedEvent {
  bookingId: string;
  userId: string;
  email?: string;
  firstName?: string;
  scheduleId: string;
  trainNumber: string;
  trainName: string;
  fromStationName?: string | null;
  toStationName?: string | null;
  departureDate: string | Date;
  seats: Array<{ seatNumber: number; seatType: string; price: number }>;
  passengers: Array<{ name: string; age: number; gender: string }>;
  totalAmount: number;
}

export interface BookingFailedEvent {
  bookingId: string;
  userId: string;
  email?: string;
  firstName?: string;
  scheduleId: string;
  reason: string;
}

export interface BookingCancelledEvent extends BookingFailedEvent {
  refundAmount?: number;
}

export interface KafkaMessageEnvelope<T> {
  eventType?: string;
  data?: T;
  timestamp?: string;
}

export interface HealthCheck {
  name: string;
  status: 'ok' | 'degraded' | 'unhealthy';
  detail?: string;
}

export interface HealthCheckResult {
  status: 'ok' | 'degraded' | 'unhealthy';
  service: string;
  checks: HealthCheck[];
  timestamp: string;
}
