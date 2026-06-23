// Copyright (c) 2026 BowenLabs. All rights reserved.
// Cadmus is MIT licensed. See LICENSE in the repo root.
//
// @thebes/cadmus/email
//
// Thin wrapper over the CF Email Workers `send_email` binding. The
// binding only accepts a raw MIME message, not a {to, subject, html}
// object, so this builds one via `mimetext/browser` (no Node-only APIs —
// fits the V8 isolate) and constructs the `cloudflare:email` EmailMessage
// for `binding.send()`.

import { EmailMessage } from "cloudflare:email";
import { createMimeMessage } from "mimetext/browser";
import { CadmusEmailError } from "../errors.js";

export interface SendEmailInput {
  from: string;
  to: string;
  subject: string;
  html: string;
}

/** Sends an email via the CF Email Workers `send_email` binding. */
export async function sendEmail(
  binding: SendEmail,
  input: SendEmailInput,
): Promise<void> {
  const message = createMimeMessage();
  message.setSender(input.from);
  message.setRecipient(input.to);
  message.setSubject(input.subject);
  message.addMessage({ contentType: "text/html", data: input.html });

  try {
    await binding.send(new EmailMessage(input.from, input.to, message.asRaw()));
  } catch (cause) {
    throw new CadmusEmailError(`Failed to send email to "${input.to}"`, cause);
  }
}
