import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { Roles } from '../common/decorators/roles.decorator';
import { IdParamDto } from '../common/schemas/id-param.dto';
import { Role } from '../generated/prisma/enums';
import { AdminUpdateDoctorDto, CreateDoctorDto } from './doctors.dto';
import { DoctorsService } from './doctors.service';

@Roles(Role.ADMIN)
@Controller('admin/doctors')
export class AdminDoctorsController {
  constructor(private readonly doctors: DoctorsService) {}

  @Post()
  create(@Body() dto: CreateDoctorDto) {
    return this.doctors.adminCreate(dto);
  }

  @Patch(':id')
  update(@Param() { id }: IdParamDto, @Body() dto: AdminUpdateDoctorDto) {
    return this.doctors.adminUpdate(id, dto);
  }
}
