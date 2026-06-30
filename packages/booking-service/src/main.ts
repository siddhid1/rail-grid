import { bootstrapNestService } from '@irctc/shared';
import { AppModule } from './app.module.js';
void bootstrapNestService(AppModule, { serviceName: 'booking-service', swaggerTitle: 'IRCTC Booking Service' });
