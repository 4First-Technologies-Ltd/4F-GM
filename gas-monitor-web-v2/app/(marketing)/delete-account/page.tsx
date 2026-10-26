import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Delete your account",
  description:
    "How to delete your 4FG Smart Gas Monitor account and personal data, in the app or on the website.",
};

const SUPPORT_EMAIL = "4fgmonitor@gmail.com";

/** Public page Google Play links to as the account-deletion URL. It must work without signing in. */
export default function DeleteAccountPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-20 pt-36 sm:px-6">
      <div className="rounded-2xl border border-border bg-card px-6 py-10 shadow-sm sm:px-12">
        <h1 className="text-3xl font-semibold">Delete your account</h1>
        <p className="mt-3 text-muted-foreground">
          You can delete your 4FG Smart Gas Monitor account yourself, whether you are a customer, vendor,
          rider, branch manager or logistics company.
        </p>

        <h2 className="mt-8 text-xl font-semibold">In the mobile app</h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-muted-foreground">
          <li>Sign in and open your account screen (Settings, Profile or Account, depending on your role).</li>
          <li>Scroll to the bottom and tap <strong className="text-foreground">Delete my account</strong>.</li>
          <li>Enter your password to confirm.</li>
        </ol>

        <h2 className="mt-8 text-xl font-semibold">On the website</h2>
        <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-muted-foreground">
          <li>
            <Link href="/sign-in" className="text-primary underline underline-offset-2">
              Sign in
            </Link>{" "}
            and open <strong className="text-foreground">Dashboard → Settings</strong>.
          </li>
          <li>In the <strong className="text-foreground">Delete account</strong> section, choose Delete my account.</li>
          <li>Enter your password to confirm.</li>
        </ol>

        <h2 className="mt-8 text-xl font-semibold">What is deleted</h2>
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
          <li>Your name, email address, phone number and profile details.</li>
          <li>Saved delivery addresses, cylinder profiles and signed-in sessions.</li>
          <li>
            For vendors: identity and business documents, bank details, your logo and listing photos. Your
            listings are removed from the marketplace and your branches are closed.
          </li>
          <li>You are removed from our marketing emails.</li>
        </ul>

        <h2 className="mt-8 text-xl font-semibold">What we keep</h2>
        <p className="mt-3 text-muted-foreground">
          Orders, payments, earnings and payout records are kept in anonymised form because we are required
          to retain financial records. They are no longer linked to your name or contact details.
        </p>

        <h2 className="mt-8 text-xl font-semibold">When deletion is delayed</h2>
        <p className="mt-3 text-muted-foreground">
          We cannot close an account while an order or delivery is still in progress, or while a vendor has
          earnings that have not been paid out. Finish or settle those first, then delete again. The app
          tells you exactly what is blocking it.
        </p>

        <h2 className="mt-8 text-xl font-semibold">Cannot sign in?</h2>
        <p className="mt-3 text-muted-foreground">
          Email{" "}
          <a href={`mailto:${SUPPORT_EMAIL}?subject=Delete%20my%204FG%20account`} className="text-primary underline underline-offset-2">
            {SUPPORT_EMAIL}
          </a>{" "}
          from the address on your account with the subject &quot;Delete my 4FG account&quot;, and we will
          verify it is you and delete the account.
        </p>
      </div>
    </main>
  );
}
