import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  issueTokenForUserId(userId: string): { access_token: string } {
    return {
      access_token: this.jwtService.sign({ sub: userId }),
    };
  }
}
