import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { IdParamDto } from '../common/schemas/id-param.dto';
import type { AuthUser } from '../common/types/auth-user';
import { Role } from '../generated/prisma/enums';
import { RATE_LIMITS, RateLimit } from '../rate-limit/rate-limit.decorator';
import { OptionalImagePipe, type ValidatedImage } from '../uploads/image-file.pipe';
import { imageUploadOptions } from '../uploads/image-upload.options';
import { MultipartForm } from '../uploads/multipart-form.decorator';
import { parsePayload } from '../uploads/multipart-json';
import { SearchDoctorsQueryDto, updateMyProfileBase, updateMyProfileSchema } from './doctors.dto';
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
  @RateLimit(RATE_LIMITS.upload)
  @Patch('me')
  @UseInterceptors(FileInterceptor('image', imageUploadOptions))
  @MultipartForm('{"bio":"Cardiologist","experienceYears":12,"removeImage":false}')
  updateMine(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
    @UploadedFile(OptionalImagePipe) image: ValidatedImage | undefined,
  ) {
    const dto = parsePayload(image ? updateMyProfileBase : updateMyProfileSchema, body);
    return this.doctors.updateMine(user.id, dto, image);
  }

  @Public()
  @Get(':id')
  getPublic(@Param() { id }: IdParamDto) {
    return this.doctors.getPublic(id);
  }
}
