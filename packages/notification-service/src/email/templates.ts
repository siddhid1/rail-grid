export function getOtpTemplate(otp: string, ttlMinutes: number): string {
  return '<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:20px;border:1px solid #e5e5e5;border-radius:8px;background:#fff"><h2 style="color:#4A3AFF">DesignKarle</h2><p>Use this verification code to complete your sign up:</p><div style="font-size:32px;letter-spacing:8px;font-weight:bold;color:#4A3AFF;background:#F4F4FF;padding:14px 26px;text-align:center">' + otp + '</div><p>This code expires in <strong>' + ttlMinutes + ' minutes</strong>.</p></div>';
}
export function getWelcomeTemplate(firstName: string): string {
  return '<div style="font-family:Arial,sans-serif;max-width:420px;margin:auto;padding:20px;border:1px solid #e5e5e5;border-radius:8px;background:#fff"><h2 style="color:#4A3AFF">DesignKarle</h2><p>Hi <strong>' + firstName + '</strong>, your account has been successfully created and verified.</p></div>';
}
export function getBookingConfirmedTemplate(data: any): string {
  const seats = (data.seats ?? []).map((s: any) => '<li>Seat ' + s.seatNumber + ' - ' + s.seatType + ' (INR ' + s.price + ')</li>').join('');
  const passengers = (data.passengers ?? []).map((p: any, i: number) => '<li>' + (i + 1) + '. ' + p.name + ' (' + p.age + ' yrs, ' + p.gender + ')</li>').join('');
  return '<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;border:1px solid #e5e5e5;border-radius:8px;background:#fff"><h2 style="color:#4A3AFF">Booking Confirmed</h2><p>Hi ' + (data.firstName ?? 'there') + '</p><p><strong>Booking ID:</strong> ' + data.bookingId + '</p><p><strong>Train:</strong> ' + data.trainName + ' (' + data.trainNumber + ')</p><p><strong>Amount:</strong> INR ' + data.totalAmount + '</p><h3>Seats</h3><ul>' + seats + '</ul><h3>Passengers</h3><ul>' + passengers + '</ul></div>';
}
export function getBookingFailedTemplate(data: any): string {
  return '<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;border:1px solid #e5e5e5;border-radius:8px;background:#fff"><h2>Booking Unsuccessful</h2><p>Booking ' + data.bookingId + ' could not be completed. Reason: ' + (data.reason ?? 'booking_failed') + '</p></div>';
}
export function getBookingCancelledTemplate(data: any): string {
  return '<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:20px;border:1px solid #e5e5e5;border-radius:8px;background:#fff"><h2>Booking Cancelled</h2><p>Booking ' + data.bookingId + ' was cancelled. Refund amount: INR ' + (data.refundAmount ?? 0) + '</p></div>';
}
