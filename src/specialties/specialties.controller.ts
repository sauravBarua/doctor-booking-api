import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { IdParamDto } from '../common/schemas/id-param.dto';
import { Role } from '../generated/prisma/enums';
import { CreateSpecialtyDto, UpdateSpecialtyDto } from './specialties.dto';
import { SpecialtiesService } from './specialties.service';

@Controller('specialties')
export class SpecialtiesController {
  constructor(private readonly specialties: SpecialtiesService) {}

  @Public()
  @Get()
  list() {
    return this.specialties.list();
  }

  @Public()
  @Get(':id')
  get(@Param() { id }: IdParamDto) {
    return this.specialties.get(id);
  }

  @Roles(Role.ADMIN)
  @Post()
  create(@Body() dto: CreateSpecialtyDto) {
    return this.specialties.create(dto);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  update(@Param() { id }: IdParamDto, @Body() dto: UpdateSpecialtyDto) {
    return this.specialties.update(id, dto);
  }
}
