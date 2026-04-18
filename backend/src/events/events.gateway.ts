import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JWT_SECRET } from '../auth/auth.constants';

type JwtPayload = { sub: string };

export type StatusUpdatePayload = {
  jobId: string;
  status: string;
  s3Key?: string | null;
  progress?: number;
};

@WebSocketGateway({
  cors: { origin: '*' },
})
export class EventsGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) {
      this.logger.warn(`WebSocket ${client.id}: missing token (use ?token= or Authorization: Bearer)`);
      client.disconnect();
      return;
    }
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: JWT_SECRET,
      });
      const userId = payload.sub;
      await client.join(this.roomForUser(userId));
      (client.data as { userId?: string }).userId = userId;
      this.logger.log(
        `WebSocket ${client.id} authenticated as user "${userId}", joined ${this.roomForUser(userId)}. Listen for event "status_update".`,
      );
    } catch {
      this.logger.warn(`WebSocket ${client.id}: invalid or expired JWT`);
      client.disconnect();
    }
  }

  roomForUser(userId: string): string {
    return `user:${userId}`;
  }

  emitStatusUpdate(userId: string, payload: StatusUpdatePayload): void {
    const body: Record<string, unknown> = {
      jobId: payload.jobId,
      status: payload.status,
    };
    if (payload.progress !== undefined) {
      body.progress = payload.progress;
    }
    if (payload.s3Key != null && payload.s3Key !== '') {
      body.s3Key = payload.s3Key;
    }
    this.server.to(this.roomForUser(userId)).emit('status_update', body);
  }

  private extractToken(client: Socket): string | null {
    const q = client.handshake.query;
    const fromQuery =
      (typeof q.token === 'string' && q.token) ||
      (typeof q.access_token === 'string' && q.access_token);
    if (fromQuery) {
      return fromQuery;
    }
    const authHeader = client.handshake.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.slice('Bearer '.length).trim();
    }
    const auth = client.handshake.auth as { token?: string } | undefined;
    if (auth?.token) {
      return auth.token;
    }
    return null;
  }
}
