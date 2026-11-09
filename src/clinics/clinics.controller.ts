import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { IdParamDto } from '../common/schemas/id-param.dto';
import { Role } from '../generated/prisma/enums';
import { CreateClinicDto, UpdateClinicDto } from './clinics.dto';
import { ClinicsService } from './clinics.service';

@Controller('clinics')
export class ClinicsController {
  constructor(private readonly clinics: ClinicsService) {}

  @Public()
  @Get()
  list() {
    return this.clinics.list();
  }

  @Public()
  @Get(':id')
  get(@Param() { id }: IdParamDto) {
    return this.clinics.get(id);
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateClinicDto) {
    return this.clinics.create(dto);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param() { id }: IdParamDto, @Body() dto: UpdateClinicDto) {
    return this.clinics.update(id, dto);
  }
}
