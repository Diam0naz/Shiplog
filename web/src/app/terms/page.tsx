import type { Metadata } from "next";
import LegalPage from "../LegalPage";
import { REPO_URL } from "../site";

// NOTE: this is a starting point written against the code in this repository.
// Have it reviewed before you rely on it for a public launch.

export const metadata: Metadata = {
  title: "Terms and conditions · shiplog",
  description:
    "The rules for using shiplog: what you can expect from the tool, what it expects from you, and the limits of its liability.",
  robots: "index, follow",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms and conditions"
      updated="20 October 2026"
      summary="These terms cover the shiplog command-line tool and the hosted service that drafts and publishes posts. Use of either means you accept them."
    >
      <h2>1. Agreement</h2>
      <p>
        By installing the CLI, running <code>shiplog login</code> or using the hosted service, you
        agree to these terms. If you do not agree, do not use shiplog. If you use shiplog for an
        organisation, you confirm you are allowed to accept these terms on its behalf.
      </p>

      <h2>2. What shiplog does</h2>
      <p>
        shiplog reads the commits you have made since your last post, drafts a short update, and
        publishes it to a connected account — but only after you explicitly approve the text. You
        choose <strong>Post</strong>, <strong>Edit</strong> or <strong>Skip</strong> every time.
      </p>

      <h2>3. Who may use it</h2>
      <ul>
        <li>You must be at least 13 years old.</li>
        <li>
          You must have the right to publish from any account you connect, and your use of that
          account must comply with its own rules — including the user agreement and developer terms
          of LinkedIn, X, or any other platform you connect.
        </li>
        <li>
          You are responsible for keeping your machine and your session token secure. Anyone with
          access to your token can ask the service to publish.
        </li>
      </ul>

      <h2>4. Your content</h2>
      <p>
        You keep ownership of your commits, notes, voice samples and posts. To provide drafts and
        publishing, you give the operator of this instance permission to process that content — send
        it to the configured model provider, store the resulting LinkedIn and X tokens, and publish
        the text you approve — and nothing beyond that.
      </p>
      <p>
        You are responsible for what you publish: for its accuracy, for having the rights to any
        part of it, and for the fact that it goes out under your name.
      </p>

      <h2>5. Drafts are generated, and you are the publisher</h2>
      <p>
        Drafts are produced by a language model from your commit metadata and may be incomplete,
        inaccurate or unflattering. They are suggestions. Review the text before you choose{" "}
        <strong>Post</strong>; approving it makes it your post, not ours.
      </p>

      <h2>6. Acceptable use</h2>
      <p>Do not use shiplog to:</p>
      <ul>
        <li>publish anything unlawful, abusive, deceptive or spammy;</li>
        <li>access another person&apos;s account, token or data, or attempt to break the service&apos;s security;</li>
        <li>probe, overload or automate the service in a way that degrades it for others;</li>
        <li>scrape or resell the service, or present it as your own product;</li>
        <li>evade rate limits, or work around limits imposed by LinkedIn, X, or any other connected platform.</li>
      </ul>
      <p>
        The operator may suspend access if the service is being abused, or if continuing would break
        the law or a third party&apos;s terms.
      </p>

      <h2>7. Third-party services</h2>
      <p>
        shiplog depends on services it does not control: LinkedIn and X for publishing, Vercel for
        hosting and storage, and the model provider configured for this instance. Their terms and privacy
        policies apply to your use of them, and they may change or fail without notice. shiplog is
        not responsible for their availability, decisions or content.
      </p>

      <h2>8. Availability and changes</h2>
      <p>
        The service is provided as-is and may change, pause or stop at any time. There is no uptime
        guarantee. Features may be added, altered or removed, including the platforms shiplog can
        publish to.
      </p>

      <h2>9. No warranty</h2>
      <p>
        To the fullest extent permitted by law, shiplog is provided without warranties of any kind,
        express or implied, including merchantability, fitness for a particular purpose and
        non-infringement. No advice or output from the service creates a warranty.
      </p>

      <h2>10. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, the operator of this instance is not liable for
        indirect, incidental, special or consequential damages, or for lost profits, data, reputation
        or opportunities, arising from your use of shiplog — including posts you approved, drafts you
        published, outages, or a revoked or expired LinkedIn or X connection. Where liability cannot be
        excluded, it is limited to the amount you paid to use the service, if any.
      </p>

      <h2>11. Ending use</h2>
      <p>
        You may stop at any time by disconnecting the account and deleting your local configuration.
        The operator may suspend or end access for behaviour that breaches these terms.
      </p>

      <h2>12. Governing law</h2>
      <p>
        These terms are governed by the laws that apply where the operator of this instance is
        established, without regard to conflict-of-law rules. Nothing here removes a consumer right
        you have under the mandatory law of your own country.
      </p>

      <h2>13. Changes to these terms</h2>
      <p>
        These terms may be updated; the date at the top of this page will change when they are.
        Continuing to use shiplog after a change means you accept the new version.
      </p>

      <h2>14. Contact</h2>
      <p>
        Questions about these terms: open an issue at{" "}
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
          the shiplog repository
        </a>
        .
      </p>
    </LegalPage>
  );
}
