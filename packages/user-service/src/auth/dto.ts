import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, Matches, MinLength, Validate } from 'class-validator';
import { ValidatorConstraint, ValidatorConstraintInterface, ValidationArguments } from 'class-validator';

@ValidatorConstraint({ name: 'PasswordsMatch', async: false })
export class PasswordsMatchConstraint implements ValidatorConstraintInterface {
  validate(confirmPassword: string, args: ValidationArguments): boolean {
    return confirmPassword === (args.object as SendOtpDto).password;
  }
  defaultMessage(): string {
    return 'confirmPassword must match password';
  }
}

export class SendOtpDto {
  @ApiProperty() @IsString() @MinLength(2) firstName!: string;
  @ApiProperty() @IsString() @MinLength(2) lastName!: string;
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() @MinLength(8) password!: string;
  @ApiProperty() @IsString() @Validate(PasswordsMatchConstraint) confirmPassword!: string;
}

export class VerifyOtpDto {
  @ApiProperty() @IsString() @Length(6, 6) @Matches(/^[0-9]{6}$/) otp!: string;
}

export class LoginDto {
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() @MinLength(1) password!: string;
}

export class GoogleAuthDto {
  @ApiProperty() @IsString() idToken!: string;
}

export class UpdateProfileDto {
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MinLength(2) firstName?: string;
  @ApiProperty({ required: false }) @IsOptional() @IsString() @MinLength(2) lastName?: string;
}
