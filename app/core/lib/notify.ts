// Best-effort email notifications — never throws. The magic-link route
// (and anything else calling this) falls back to console logging when
// sending fails, which is also what makes local dev work without a real
// Cloudflare Email Routing domain: there's no routing configured for
// `localhost`, so the send fails and the caller's fallback kicks in.
import { sendEmail as cadmusSendEmail } from "@bowenlabs/cadmus/email";

export interface NotifyResult {
  sent: boolean;
}

export async function sendEmail(
  env: { EMAIL: SendEmail },
  input: { from: string; to: string; subject: string; html: string },
): Promise<NotifyResult> {
  try {
    await cadmusSendEmail(env.EMAIL, input);
    return { sent: true };
  } catch (err) {
    console.warn(`[notify] Failed to send email to "${input.to}":`, err);
    return { sent: false };
  }
}
