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
import {
  createSpecialtySchema,
  updateSpecialtyBase,
  updateSpecialtySchema,
} from './specialties.dto';
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
  @RateLimit(RATE_LIMITS.upload)
  @Post()
  @UseInterceptors(FileInterceptor('image', imageUploadOptions))
  @MultipartForm('{"name":"Cardiology","description":"Heart care"}')
  create(
    @Body() body: unknown,
    @UploadedFile(OptionalImagePipe) image: ValidatedImage | undefined,
  ) {
    return this.specialties.create(parsePayload(createSpecialtySchema, body), image);
  }

  @Roles(Role.ADMIN)
  @RateLimit(RATE_LIMITS.upload)
  @Patch(':id')
  @UseInterceptors(FileInterceptor('image', imageUploadOptions))
  @MultipartForm('{"description":"New text","removeImage":false}')
  update(
    @Param() { id }: IdParamDto,
    @Body() body: unknown,
    @UploadedFile(OptionalImagePipe) image: ValidatedImage | undefined,
  ) {
    const dto = parsePayload(image ? updateSpecialtyBase : updateSpecialtySchema, body);
    return this.specialties.update(id, dto, image);
  }
}
