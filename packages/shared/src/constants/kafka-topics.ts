export const KAFKA_TOPICS = {
  OTP_EMAIL: 'notification.otp-email',
  WELCOME_EMAIL: 'notification.welcome-email',
  BOOKING_EMAIL: 'notification.booking-email',
  PAYMENT_EMAIL: 'notification.payment-email',
  TRAIN_CREATED: 'admin.train-created',
  STATION_CREATED: 'admin.station-created',
  ROUTE_CREATED: 'admin.route-created',
  SCHEDULE_CREATED: 'admin.schedule-created',
  TRAIN_UPDATED: 'admin.train-updated',
  STATION_UPDATED: 'admin.station-updated',
  ROUTE_UPDATED: 'admin.route-updated',
  SCHEDULE_CANCELLED: 'admin.schedule-cancelled',
  SEAT_AVAILABILITY_UPDATED: 'inventory.seat-availability-updated',
  BOOKING_CONFIRMED: 'booking.confirmed',
  BOOKING_CANCELLED: 'booking.cancelled',
  BOOKING_FAILED: 'booking.failed',
  PAYMENT_SUCCESS: 'payment.success',
  PAYMENT_FAILED: 'payment.failed',
  DLQ_BOOKING: 'dlq.booking-service',
  DLQ_INVENTORY: 'dlq.inventory-service',
  DLQ_SEARCH: 'dlq.search-service',
  DLQ_NOTIFICATION: 'dlq.notification-service',
} as const;

export type KafkaTopic = (typeof KAFKA_TOPICS)[keyof typeof KAFKA_TOPICS];
export const DLQ_MAX_RETRIES = 3;
