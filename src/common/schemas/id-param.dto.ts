import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';
import { uuidSchema } from './common.schemas';

export class IdParamDto extends createZodDto(z.object({ id: uuidSchema })) {}
