import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Health } from '@plumiotheca/contracts';

@ApiTags('santé')
@SkipThrottle()
@Controller('health')
export class HealthController {
  /** Vivacité du processus (sondes de l'orchestrateur, supervision). */
  @Get()
  @ApiOkResponse({ description: 'L’API répond', standardSchema: Health })
  check(): Health {
    return { status: 'ok' };
  }
}
