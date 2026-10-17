import { Global, Module } from '@nestjs/common';
import { JobsService } from './jobs.service.js';

/** File de tâches en arrière-plan, disponible pour tous les modules. */
@Global()
@Module({
  providers: [JobsService],
  exports: [JobsService],
})
export class JobsModule {}
