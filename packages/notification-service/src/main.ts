import { bootstrapNestService } from '@irctc/shared';
import { AppModule } from './app.module.js';
void bootstrapNestService(AppModule, { serviceName: 'notification-service', swaggerTitle: 'IRCTC Notification Service', rawBody: false });
