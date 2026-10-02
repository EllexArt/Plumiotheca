import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { MySession } from '@plumiotheca/contracts';
import type { AuthUser } from '../auth/auth-user.js';
import { CurrentUser } from '../auth/decorators.js';

@ApiTags('compte')
@ApiBearerAuth()
@Controller('moi')
export class MeController {
  /** Rôles et double authentification de la session en cours (menus de l'application). */
  @Get()
  @ApiOkResponse({ description: 'Session en cours', standardSchema: MySession })
  session(@CurrentUser() user: AuthUser): MySession {
    return { roles: user.roles, rolesAwaitingMfa: user.rolesAwaitingMfa, mfa: user.mfa };
  }
}
