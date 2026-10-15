import { Module } from '@nestjs/common';
import { AccountController, HandlesController } from './account.controller.js';
import { KeycloakAdminService } from '../auth/keycloak-admin.service.js';
import { AccountService } from './account.service.js';
import { LockedAccountsService } from './locked-accounts.service.js';

@Module({
  controllers: [AccountController, HandlesController],
  providers: [AccountService, LockedAccountsService, KeycloakAdminService],
  exports: [AccountService],
})
export class AccountModule {}
