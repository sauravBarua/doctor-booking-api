import { applyDecorators } from '@nestjs/common';
import { ApiBody, ApiConsumes } from '@nestjs/swagger';

export const MultipartForm = (dataExample: string) =>
  applyDecorators(
    ApiConsumes('multipart/form-data'),
    ApiBody({
      schema: {
        type: 'object',
        properties: {
          data: { type: 'string', description: 'JSON text', example: dataExample },
          image: { type: 'string', format: 'binary' },
        },
      },
    }),
  );
