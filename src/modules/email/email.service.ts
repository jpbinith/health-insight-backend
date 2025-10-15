import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import 'isomorphic-fetch';
import { Client } from '@microsoft/microsoft-graph-client';
import { ClientSecretCredential } from '@azure/identity';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly graphClient: Client;
  private readonly fromAddress: string;
  private readonly fromName: string;
  private readonly appName: string;
  private readonly senderUserId: string;

  constructor() {
    this.fromAddress = (process.env.EMAIL_FROM_ADDRESS ?? '').trim();
    this.fromName = (process.env.EMAIL_FROM_NAME ?? '').trim();
    this.appName = process.env.APP_NAME ?? 'Health Insight';

    if (!this.fromAddress) {
      throw new Error('EMAIL_FROM_ADDRESS environment variable is not defined.');
    }

    const tenantId = process.env.GRAPH_TENANT_ID;
    const clientId = process.env.GRAPH_CLIENT_ID;
    const clientSecret = process.env.GRAPH_CLIENT_SECRET;
    this.senderUserId = (
      process.env.GRAPH_SENDER_USER_ID ?? this.fromAddress
    ).trim();

    if (!tenantId || !clientId || !clientSecret) {
      throw new Error(
        'Microsoft Graph credentials are not fully configured. Check GRAPH_TENANT_ID, GRAPH_CLIENT_ID, and GRAPH_CLIENT_SECRET.',
      );
    }

    if (!this.senderUserId) {
      throw new Error(
        'GRAPH_SENDER_USER_ID must be provided or default to EMAIL_FROM_ADDRESS.',
      );
    }

    const credential = new ClientSecretCredential(
      tenantId,
      clientId,
      clientSecret,
    );

    this.graphClient = Client.initWithMiddleware({
      authProvider: {
        getAccessToken: async () => {
          const token = await credential.getToken(
            'https://graph.microsoft.com/.default',
          );

          if (!token) {
            throw new Error('Unable to acquire Microsoft Graph access token.');
          }

          return token.token;
        },
      },
    });
  }

  async sendPasswordResetEmail(
    recipientEmail: string,
    recipientName: string,
    resetUrl: string,
  ): Promise<void> {
    const toName = recipientName?.trim() || 'there';
    const subject = `${this.appName} password reset`;
    const greeting = this.fromName ? this.fromName : this.appName;
    const htmlBody =
      `<p>Hi ${toName},</p>` +
      `<p>We received a request to reset your ${this.appName} password. Click the link below to choose a new password:</p>` +
      `<p><a href="${resetUrl}">${resetUrl}</a></p>` +
      `<p>If you did not request this, please ignore this email or contact support.</p>` +
      `<p>Thanks,<br/>${greeting}</p>`;

    try {
      const message = {
        subject,
        body: {
          contentType: 'HTML',
          content: htmlBody,
        },
        toRecipients: [
          {
            emailAddress: {
              address: recipientEmail,
              name: toName,
            },
          },
        ],
        replyTo: [
          {
            emailAddress: {
              address: this.fromAddress,
              name: this.fromName || undefined,
            },
          },
        ],
      };

      const payload = {
        message,
        saveToSentItems: false,
      };

      const endpointUserId = encodeURIComponent(this.senderUserId);

      await this.graphClient
        .api(`/users/${endpointUserId}/sendMail`)
        .post(payload);
    } catch (error) {
      this.logger.error(
        'Unable to send password reset email',
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(
        'Failed to send password reset email.',
      );
    }
  }
}
