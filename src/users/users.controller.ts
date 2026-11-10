import { Body, Controller, Get, Patch, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import type { AuthUser } from '../common/types/auth-user';
import { Role } from '../generated/prisma/enums';
import { RATE_LIMITS, RateLimit } from '../rate-limit/rate-limit.decorator';
import { OptionalImagePipe, type ValidatedImage } from '../uploads/image-file.pipe';
import { imageUploadOptions } from '../uploads/image-upload.options';
import { MultipartForm } from '../uploads/multipart-form.decorator';
import { parsePayload } from '../uploads/multipart-json';
import { updateMeBase, updateMeSchema } from './users.dto';
import { UsersService } from './users.service';

@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  me(@CurrentUser() user: AuthUser) {
    return this.users.getProfile(user.id);
  }

  /** Patients and admins. Doctors use PATCH /doctors/me (their name is managed by an admin). */
  @Roles(Role.PATIENT, Role.ADMIN)
  @RateLimit(RATE_LIMITS.upload)
  @Patch()
  @UseInterceptors(FileInterceptor('image', imageUploadOptions))
  @MultipartForm('{"name":"Jane Doe","removeImage":false}')
  update(
    @CurrentUser() user: AuthUser,
    @Body() body: unknown,
    @UploadedFile(OptionalImagePipe) image: ValidatedImage | undefined,
  ) {
    const dto = parsePayload(image ? updateMeBase : updateMeSchema, body);
    return this.users.updateProfile(user.id, dto, image);
  }
}
