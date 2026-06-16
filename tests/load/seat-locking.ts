import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 50,
  duration: '2m',
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.05'],
  },
};

const BASE_URL = __ENV.INVENTORY_URL || 'http://localhost:4007/api/v1';
const SERVICE_KEY = __ENV.INTERNAL_SERVICE_KEY || 'local-internal-service-key-change-me-32';

export default function () {
  const body = JSON.stringify({
    scheduleId: __ENV.SCHEDULE_ID || 'schedule-load-test',
    seatIds: [__ENV.SEAT_ID || 'seat-1'],
    userId: 'load-user-' + __VU,
    ttlSeconds: 120,
    fromSeq: 1,
    toSeq: 3,
  });
  const res = http.post(BASE_URL + '/seats/lock', body, { headers: { 'Content-Type': 'application/json', 'x-internal-service-key': SERVICE_KEY } });
  check(res, { 'lock response is bounded': (r) => [200, 409, 404].includes(r.status) });
  sleep(1);
}
