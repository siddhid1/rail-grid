import { bootstrapNestService } from '@irctc/shared';
import { AppModule } from './app.module.js';

void bootstrapNestService(AppModule, {
  serviceName: 'user-service',
  swaggerTitle: 'IRCTC User Service',
});
