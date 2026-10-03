import { Module } from '@nestjs/common';
import { AccountController, HandlesController } from './account.controller.js';
import { AccountService } from './account.service.js';

@Module({
  controllers: [AccountController, HandlesController],
  providers: [AccountService],
  exports: [AccountService],
})
export class AccountModule {}
