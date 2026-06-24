import { bootstrapNestService } from '@irctc/shared';
import { AppModule } from './app.module.js';

void bootstrapNestService(AppModule, {
  serviceName: 'admin-service',
  swaggerTitle: 'IRCTC Admin Service',
});
