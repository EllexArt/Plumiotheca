import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOkResponse, ApiTags } from '@nestjs/swagger';
import {
  AcceptCharter,
  SetEmailDigest,
  SetReadingStats,
  ChangeHandle,
  FirstVisit,
  Handle,
  HandleAvailability,
  MyAccount,
  PublicProfile,
  UpdateProfile,
  SetAvatar,
  ReadingPreferences,
  Appearance,
  ReadingLimits,
} from '@plumiotheca/contracts';
import { Public } from '../auth/decorators.js';
import type { User } from '../users/user.entity.js';
import { AllowAccountSteps, CurrentAccount } from './account.decorators.js';
import { AccountService } from './account.service.js';

@ApiTags('compte')
@ApiBearerAuth()
@Controller('moi/compte')
export class AccountController {
  constructor(private readonly accounts: AccountService) {}

  /** Mon compte et l'étape à franchir (première visite, charte…), même verrouillé. */
  @Get()
  @AllowAccountSteps('first-visit', 'charter', 'age-locked')
  @ApiOkResponse({ standardSchema: MyAccount })
  get(@CurrentAccount() account: User): MyAccount {
    return this.accounts.view(account);
  }

  /** Première visite : pseudonyme, âge déclaré (15 ans minimum), charte acceptée. */
  @Post('premiere-visite')
  @AllowAccountSteps('first-visit', 'age-locked')
  @ApiOkResponse({ standardSchema: MyAccount })
  async firstVisit(
    @CurrentAccount() account: User,
    @Body({ schema: FirstVisit }) input: FirstVisit,
  ): Promise<MyAccount> {
    return this.accounts.view(await this.accounts.firstVisit(account, input));
  }

  /** Acceptation d'une nouvelle version de la charte. */
  @Post('charte')
  @AllowAccountSteps('charter')
  @ApiOkResponse({ standardSchema: MyAccount })
  async acceptCharter(
    @CurrentAccount() account: User,
    @Body({ schema: AcceptCharter }) input: AcceptCharter,
  ): Promise<MyAccount> {
    return this.accounts.view(await this.accounts.acceptCharter(account, input.charterVersion));
  }

  @Put('pseudonyme')
  @ApiOkResponse({ standardSchema: MyAccount })
  async changeHandle(
    @CurrentAccount() account: User,
    @Body({ schema: ChangeHandle }) input: ChangeHandle,
  ): Promise<MyAccount> {
    return this.accounts.view(await this.accounts.changeHandle(account, input.handle));
  }

  @Patch('profil')
  @ApiOkResponse({ standardSchema: MyAccount })
  async updateProfile(
    @CurrentAccount() account: User,
    @Body({ schema: UpdateProfile }) input: UpdateProfile,
  ): Promise<MyAccount> {
    return this.accounts.view(await this.accounts.updateProfile(account, input));
  }

  /** Apparence du site (#77) : ambiance et mode, retrouvés sur tous les appareils. */
  @Put('apparence')
  @ApiOkResponse({ standardSchema: MyAccount })
  async setAppearance(
    @CurrentAccount() account: User,
    @Body({ schema: Appearance }) input: Appearance,
  ): Promise<MyAccount> {
    return this.accounts.view(await this.accounts.setAppearance(account, input));
  }

  /** Mes limites (#152) : avertissements facultatifs masqués partout. */
  @Put('limites')
  @ApiOkResponse({ standardSchema: MyAccount })
  async setLimits(
    @CurrentAccount() account: User,
    @Body({ schema: ReadingLimits }) input: ReadingLimits,
  ): Promise<MyAccount> {
    return this.accounts.view(await this.accounts.setLimits(account, input));
  }

  /** Bilan de lecture (#34) : l'afficher ou non (le désactiver efface le temps mesuré). */
  @Put('bilan')
  @ApiOkResponse({ standardSchema: MyAccount })
  async setReadingStats(
    @CurrentAccount() account: User,
    @Body({ schema: SetReadingStats }) input: SetReadingStats,
  ): Promise<MyAccount> {
    return this.accounts.view(await this.accounts.setReadingStats(account, input.readingStats));
  }

  /** E-mail récapitulatif des notifications (#33) : jamais, chaque jour, chaque semaine. */
  @Put('notifications')
  @ApiOkResponse({ standardSchema: MyAccount })
  async setEmailDigest(
    @CurrentAccount() account: User,
    @Body({ schema: SetEmailDigest }) input: SetEmailDigest,
  ): Promise<MyAccount> {
    return this.accounts.view(await this.accounts.setEmailDigest(account, input.emailDigest));
  }

  /** Réglages de lecture (#28) : police, taille, interligne, largeur. */
  @Put('lecture')
  @ApiOkResponse({ standardSchema: MyAccount })
  async setReading(
    @CurrentAccount() account: User,
    @Body({ schema: ReadingPreferences }) input: ReadingPreferences,
  ): Promise<MyAccount> {
    return this.accounts.view(await this.accounts.setReading(account, input));
  }

  /** Retour aux réglages de lecture de l'appareil (ou par défaut). */
  @Delete('lecture')
  @ApiOkResponse({ standardSchema: MyAccount })
  async resetReading(@CurrentAccount() account: User): Promise<MyAccount> {
    return this.accounts.view(await this.accounts.setReading(account, null));
  }

  /** Avatar : une image téléversée (usage « avatar ») et prête, jamais une URL. */
  @Put('avatar')
  @ApiOkResponse({ standardSchema: MyAccount })
  async setAvatar(
    @CurrentAccount() account: User,
    @Body({ schema: SetAvatar }) input: SetAvatar,
  ): Promise<MyAccount> {
    return this.accounts.view(await this.accounts.setAvatar(account, input.mediaId));
  }

  @Delete('avatar')
  @ApiOkResponse({ standardSchema: MyAccount })
  async removeAvatar(@CurrentAccount() account: User): Promise<MyAccount> {
    return this.accounts.view(await this.accounts.setAvatar(account, null));
  }
}

@ApiTags('profils')
@Controller('pseudonymes')
export class HandlesController {
  constructor(private readonly accounts: AccountService) {}

  /** Disponibilité d'un pseudonyme (aide à la saisie de la première visite). */
  @Get(':handle/disponibilite')
  @ApiBearerAuth()
  @AllowAccountSteps('first-visit', 'charter')
  @ApiOkResponse({ standardSchema: HandleAvailability })
  async availability(
    @Param('handle', { schema: Handle }) handle: string,
  ): Promise<HandleAvailability> {
    return { available: await this.accounts.isAvailable(handle) };
  }

  /** Profil public : ni e-mail, ni identifiant Keycloak, ni âge. */
  @Get(':handle')
  @Public()
  @ApiOkResponse({ standardSchema: PublicProfile })
  async profile(@Param('handle', { schema: Handle }) handle: string): Promise<PublicProfile> {
    const profile = await this.accounts.publicProfile(handle);
    if (!profile) throw new NotFoundException();
    return profile;
  }
}
