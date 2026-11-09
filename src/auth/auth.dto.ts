import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const email = z.string().trim().toLowerCase().pipe(z.email());
const password = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .refine((value) => Buffer.byteLength(value, 'utf8') <= 72, 'Password must be at most 72 bytes');
const code = z.string().regex(/^\d{6}$/, 'The code has 6 digits');
const refreshToken = z.string().min(20).max(200);

const registerSchema = z.object({ name: z.string().trim().min(2).max(100), email, password });
const verifyEmailSchema = z.object({ email, code });
const loginSchema = z.object({ email, password: z.string().min(1).max(200) });
const otpRequestSchema = z.object({ email });
const otpVerifySchema = z.object({ email, code });
const refreshSchema = z.object({ refreshToken });
const googleCallbackSchema = z.object({
  code: z.string().min(1).max(2048),
  state: z.string().min(10).max(200),
});

export class RegisterDto extends createZodDto(registerSchema) {}
export class VerifyEmailDto extends createZodDto(verifyEmailSchema) {}
export class LoginDto extends createZodDto(loginSchema) {}
export class OtpRequestDto extends createZodDto(otpRequestSchema) {}
export class OtpVerifyDto extends createZodDto(otpVerifySchema) {}
export class RefreshDto extends createZodDto(refreshSchema) {}
export class GoogleCallbackDto extends createZodDto(googleCallbackSchema) {}
