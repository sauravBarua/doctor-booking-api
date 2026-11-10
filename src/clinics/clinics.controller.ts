import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { IdParamDto } from '../common/schemas/id-param.dto';
import { Role } from '../generated/prisma/enums';
import { RATE_LIMITS, RateLimit } from '../rate-limit/rate-limit.decorator';
import { OptionalImagePipe, type ValidatedImage } from '../uploads/image-file.pipe';
import { imageUploadOptions } from '../uploads/image-upload.options';
import { MultipartForm } from '../uploads/multipart-form.decorator';
import { parsePayload } from '../uploads/multipart-json';
import { createClinicSchema, updateClinicBase, updateClinicSchema } from './clinics.dto';
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
  @RateLimit(RATE_LIMITS.upload)
  @Post()
  @UseInterceptors(FileInterceptor('image', imageUploadOptions))
  @MultipartForm(
    '{"name":"Central Clinic","addressLine":"1 rue de Rivoli","city":"Paris","phone":"0140000000"}',
  )
  create(
    @Body() body: unknown,
    @UploadedFile(OptionalImagePipe) image: ValidatedImage | undefined,
  ) {
    return this.clinics.create(parsePayload(createClinicSchema, body), image);
  }

  @Roles(Role.ADMIN)
  @RateLimit(RATE_LIMITS.upload)
  @Patch(':id')
  @UseInterceptors(FileInterceptor('image', imageUploadOptions))
  @MultipartForm('{"phone":"0140000001","removeImage":false}')
  update(
    @Param() { id }: IdParamDto,
    @Body() body: unknown,
    @UploadedFile(OptionalImagePipe) image: ValidatedImage | undefined,
  ) {
    const dto = parsePayload(image ? updateClinicBase : updateClinicSchema, body);
    return this.clinics.update(id, dto, image);
  }
}
