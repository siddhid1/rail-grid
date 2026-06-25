import { bootstrapNestService } from '@irctc/shared';
import { AppModule } from './app.module.js';
void bootstrapNestService(AppModule, { serviceName: 'inventory-service', swaggerTitle: 'IRCTC Inventory Service' });
