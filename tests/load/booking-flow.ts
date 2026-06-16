import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 25,
  duration: '3m',
  thresholds: {
    http_req_duration: ['p(95)<2500'],
    http_req_failed: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.BOOKING_URL || 'http://localhost:4005/api/v1';
const TOKEN = __ENV.ACCESS_TOKEN || '';

export default function () {
  const body = JSON.stringify({
    scheduleId: __ENV.SCHEDULE_ID || 'schedule-load-test',
    seatIds: [__ENV.SEAT_ID || 'seat-1'],
    passengers: [{ name: 'Load User', age: 30, gender: 'M' }],
    idempotencyKey: 'load-' + __VU + '-' + __ITER,
    fromSeq: 1,
    toSeq: 3,
  });
  const res = http.post(BASE_URL + '/bookings', body, { headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN } });
  check(res, { 'booking returns controlled status': (r) => [200, 201, 400, 401, 409].includes(r.status) });
  sleep(1);
}
