import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { IdParamDto } from '../common/schemas/id-param.dto';
import type { AuthUser } from '../common/types/auth-user';
import { Role } from '../generated/prisma/enums';
import { SearchDoctorsQueryDto, UpdateMyProfileDto } from './doctors.dto';
import { DoctorsService } from './doctors.service';

@Controller('doctors')
export class DoctorsController {
  constructor(private readonly doctors: DoctorsService) {}

  @Public()
  @Get()
  search(@Query() query: SearchDoctorsQueryDto) {
    return this.doctors.search(query);
  }

  @Roles(Role.DOCTOR)
  @Get('me')
  getMine(@CurrentUser() user: AuthUser) {
    return this.doctors.getMine(user.id);
  }

  @Roles(Role.DOCTOR)
  @Patch('me')
  updateMine(@CurrentUser() user: AuthUser, @Body() dto: UpdateMyProfileDto) {
    return this.doctors.updateMine(user.id, dto);
  }

  @Public()
  @Get(':id')
  getPublic(@Param() { id }: IdParamDto) {
    return this.doctors.getPublic(id);
  }
}
