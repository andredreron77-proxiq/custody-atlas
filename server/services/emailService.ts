import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendAttorneyInviteEmail(toEmail: string): Promise<void> {
  await resend.emails.send({
    from: "Custody Atlas <no-reply@mail.custodyatlas.com>",
    to: toEmail,
    subject: "You've been invited to Custody Atlas",
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1a1a1a;">
        <h2 style="margin:0 0 16px;">You're invited to Custody Atlas</h2>
        <p style="margin:0 0 24px;line-height:1.6;">
          You've been invited to access the Custody Atlas attorney portal,
          where you can view and support your client's custody case.
        </p>
        <a href="https://custodyatlas.com/attorney"
           style="display:inline-block;background:#1a1a1a;color:#fff;padding:12px 24px;
                  border-radius:6px;text-decoration:none;font-weight:600;">
          Access Attorney Portal
        </a>
        <p style="margin:32px 0 0;font-size:13px;color:#666;">
          Sign up or log in using this email address to connect with your client.<br/>
          Custody Atlas - AI-powered custody guidance.
        </p>
      </div>
    `,
  });
}
