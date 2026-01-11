import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import nodemailer, { Transporter } from 'nodemailer';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly transporter: Transporter;
  private readonly fromAddress: string;
  private readonly fromName: string;
  private readonly appName: string;

  constructor() {
    this.fromAddress = (process.env.EMAIL_FROM_ADDRESS ?? '').trim();
    this.fromName = (process.env.EMAIL_FROM_NAME ?? '').trim();
    this.appName = process.env.APP_NAME ?? 'Health Insight';

    if (!this.fromAddress) {
      throw new Error('EMAIL_FROM_ADDRESS environment variable is not defined.');
    }

    const smtpHost = (process.env.SMTP_HOST ?? '').trim();
    const smtpPortValue = (process.env.SMTP_PORT ?? '').toString().trim();
    const smtpUsername = (process.env.SMTP_USERNAME ?? '').trim();
    const smtpPassword = process.env.SMTP_PASSWORD;

    const smtpPort = Number(smtpPortValue);

    if (!smtpHost || Number.isNaN(smtpPort) || smtpPort <= 0) {
      throw new Error(
        'SMTP_HOST and a valid SMTP_PORT are required for the email service.',
      );
    }

    if (!smtpUsername || !smtpPassword) {
      throw new Error('SMTP_USERNAME and SMTP_PASSWORD must be configured.');
    }

    this.transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUsername,
        pass: smtpPassword,
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
    const textBody =
      `Hi ${toName},\n\n` +
      `We received a request to reset your ${this.appName} password. Use the link below to choose a new password:\n` +
      `${resetUrl}\n\n` +
      'If you did not request this, please ignore this email or contact support.\n\n' +
      `Thanks,\n${greeting}`;

    try {
      await this.transporter.sendMail({
        from: this.fromName
          ? `"${this.fromName}" <${this.fromAddress}>`
          : this.fromAddress,
        to: recipientEmail,
        subject,
        html: htmlBody,
        text: textBody,
        replyTo: this.fromName
          ? `"${this.fromName}" <${this.fromAddress}>`
          : this.fromAddress,
      });
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
