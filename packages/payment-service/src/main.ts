import { bootstrapNestService } from '@irctc/shared';
import { AppModule } from './app.module.js';
void bootstrapNestService(AppModule, { serviceName: 'payment-service', swaggerTitle: 'IRCTC Payment Service', rawBody: true });
