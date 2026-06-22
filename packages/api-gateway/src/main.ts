import { bootstrapNestService } from '@irctc/shared';
import { AppModule } from './app.module.js';
void bootstrapNestService(AppModule, { serviceName: 'api-gateway', swaggerTitle: 'IRCTC API Gateway' });
