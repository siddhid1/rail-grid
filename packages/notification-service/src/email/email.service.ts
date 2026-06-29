import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sgMail from '@sendgrid/mail';
import { retry } from '@irctc/shared';
import { getBookingCancelledTemplate, getBookingConfirmedTemplate, getBookingFailedTemplate, getOtpTemplate, getWelcomeTemplate } from './templates.js';

@Injectable()
export class EmailService {
  constructor(private readonly config: ConfigService) {
    sgMail.setApiKey(config.get<string>('SENDGRID_API_KEY') ?? '');
  }
  sendOtpEmail(email: string, otp: string, ttlMinutes: number): Promise<void> { return this.send(email, 'Your verification code', getOtpTemplate(otp, ttlMinutes)); }
  sendWelcomeEmail(email: string, firstName: string): Promise<void> { return this.send(email, 'Welcome - Email Verified', getWelcomeTemplate(firstName)); }
  sendBookingConfirmedEmail(email: string, data: any): Promise<void> { return this.send(email, 'Booking Confirmed - ' + (data.trainName ?? 'Your Train Ticket'), getBookingConfirmedTemplate(data)); }
  sendBookingFailedEmail(email: string, data: any): Promise<void> { return this.send(email, 'Booking Unsuccessful', getBookingFailedTemplate(data)); }
  sendBookingCancelledEmail(email: string, data: any): Promise<void> { return this.send(email, 'Booking Cancelled', getBookingCancelledTemplate(data)); }
  private async send(to: string, subject: string, html: string): Promise<void> {
    await retry(async () => { await sgMail.send({ to, from: this.config.get<string>('MAIL_FROM') ?? 'no-reply@example.com', subject, html, text: html.replace(/<[^>]+>/g, ' ') }); }, 2, 1000);
  }
}
