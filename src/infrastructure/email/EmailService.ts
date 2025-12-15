import nodemailer from 'nodemailer';
import handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';
import { env } from '../../config/env';
import { logger } from '../logger';

type TemplateName = 'otp' | 'password-reset' | 'onboarding-approved' | 'onboarding-rejected' | 'document-status-update';

export class EmailService {
  private transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: env.SMTP_AUTH_DISABLED ? undefined : {
      user: env.SMTP_USERNAME,
      pass: env.SMTP_PASSWORD,
    },
  });

  private compileTemplate(template: TemplateName, variables: Record<string, unknown>): string {
    const file = path.join(__dirname, 'templates', `${template}.hbs`);
    const source = fs.readFileSync(file, 'utf-8');
    const tpl = handlebars.compile(source);
    return tpl(variables);
  }

  async sendOtpEmail(to: string, code: string): Promise<void> {
    if (env.SMTP_AUTH_DISABLED) {
      logger.warn({ to }, 'SMTP disabled; skipping email send');
      return;
    }
    const html = this.compileTemplate('otp', { code });
    await this.transporter.sendMail({
      from: env.SMTP_SENDER_EMAIL,
      to,
      subject: 'Seu código de verificação Turbofy',
      html,
    });
    logger.info({ to }, 'OTP email sent');
  }

  async sendPasswordResetEmail(to: string, resetToken: string): Promise<void> {
    if (env.SMTP_AUTH_DISABLED) {
      logger.warn({ to }, 'SMTP disabled; skipping password reset email');
      return;
    }
    const resetUrl = `${env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    const html = this.compileTemplate('password-reset', { resetUrl });
    await this.transporter.sendMail({
      from: env.SMTP_SENDER_EMAIL,
      to,
      subject: 'Redefinição de senha - Turbofy',
      html,
    });
    logger.info({ to }, 'Password reset email sent');
  }

  async sendGenericEmail(to: string, subject: string, html: string): Promise<void> {
    if (env.SMTP_AUTH_DISABLED) {
      logger.warn({ to }, 'SMTP disabled; skipping generic email');
      return;
    }
    await this.transporter.sendMail({
      from: env.SMTP_SENDER_EMAIL,
      to,
      subject,
      html,
    });
    logger.info({ to }, 'Generic email sent');
  }

  async sendOnboardingStatusEmail(
    to: string,
    status: "APPROVED" | "REJECTED",
    reason?: string,
    name?: string
  ): Promise<void> {
    if (env.SMTP_AUTH_DISABLED) {
      logger.warn({ to }, 'SMTP disabled; skipping onboarding status email');
      return;
    }

    const template: TemplateName =
      status === "APPROVED" ? "onboarding-approved" : "onboarding-rejected";
    const html = this.compileTemplate(template, {
      name,
      reason,
    });

    await this.transporter.sendMail({
      from: env.SMTP_SENDER_EMAIL,
      to,
      subject:
        status === "APPROVED"
          ? "Cadastro aprovado - Turbofy"
          : "Cadastro reprovado - Turbofy",
      html,
    });
    logger.info({ to, status }, 'Onboarding status email sent');
  }

  async sendDocumentStatusEmail(
    to: string,
    params: { merchantName?: string; documentType: string; status: string; reason?: string }
  ): Promise<void> {
    if (env.SMTP_AUTH_DISABLED) {
      logger.warn({ to }, 'SMTP disabled; skipping document status email');
      return;
    }

    const html = this.compileTemplate('document-status-update', {
      name: params.merchantName ?? 'Produtor',
      documentType: this.getDocumentTypeLabel(params.documentType),
      statusLabel: this.getStatusLabel(params.status),
      reason: params.reason,
    });

    await this.transporter.sendMail({
      from: env.SMTP_SENDER_EMAIL,
      to,
      subject: 'Atualização sobre seus documentos - Turbofy',
      html,
    });

    logger.info({ to, status: params.status }, 'Document status email sent');
  }

  private getDocumentTypeLabel(documentType: string): string {
    const map: Record<string, string> = {
      RG_FRONT: 'Frente do documento',
      RG_BACK: 'Verso do documento',
      SELFIE: 'Selfie com documento',
      CNH_OPENED: 'CNH aberta',
    };
    return map[documentType] ?? documentType;
  }

  private getStatusLabel(status: string): string {
    const map: Record<string, string> = {
      APPROVED: 'Aprovado',
      REJECTED: 'Rejeitado',
      CHANGES_REQUESTED: 'Correções necessárias',
      PENDING_ANALYSIS: 'Em análise',
    };
    return map[status] ?? status;
  }
}
