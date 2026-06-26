import { bootstrapNestService } from '@irctc/shared';
import { AppModule } from './app.module.js';
void bootstrapNestService(AppModule, { serviceName: 'search-service', swaggerTitle: 'IRCTC Search Service' });
