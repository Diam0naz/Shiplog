import type { Metadata } from "next";
import LegalPage from "../LegalPage";
import { REPO_URL } from "../site";

// NOTE: this is a starting point written against the code in this repository.
// Have it reviewed before you rely on it for a public launch.

export const metadata: Metadata = {
  title: "Privacy policy · shiplog",
  description:
    "What shiplog keeps on your machine, what it sends to the service to draft a post, what is stored after you approve one, and how to delete it.",
  robots: "index, follow",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      updated="20 October 2026"
      summary="shiplog runs on your machine and only sends the commit metadata needed to draft a post. This page lists exactly what leaves your computer, what the hosted service stores, and how to remove it."
    >
      <h2>What shiplog is</h2>
      <p>
        shiplog has two parts: a command-line program you run on your own computer, and a
        hosted service that drafts and publishes posts. The CLI reads your git history locally. The
        service only sees what the CLI sends it when you ask for a draft or approve a post.
      </p>

      <h2>What stays on your machine</h2>
      <ul>
        <li>
          <strong>Session token</strong> — <code>~/.config/shiplog/credentials.json</code>, created
          with owner-only permissions.
        </li>
        <li>
          <strong>Voice samples</strong> — <code>~/.config/shiplog/voice.txt</code>, the posts you
          paste in with <code>shiplog voice</code>.
        </li>
        <li>
          <strong>Last posted commit</strong> — <code>.git/shiplog-last</code> inside each
          repository, so the same commits are not drafted twice.
        </li>
        <li>
          <strong>Your repository</strong> — the CLI reads commit messages, bodies and changed file
          names directly from your git history.
        </li>
      </ul>

      <h2>What is sent to the service</h2>
      <p>
        Nothing is sent until you run <code>shiplog post</code>, and what is sent is limited to what
        the draft needs:
      </p>
      <ul>
        <li>commit subjects, and commit bodies truncated to 300 characters;</li>
        <li>up to 8 changed file paths per commit — file names only, never file contents or diffs;</li>
        <li>at most 20 commits made since your last post;</li>
        <li>the optional note you pass on the command line;</li>
        <li>
          your saved voice samples for that request (up to the last 8, each truncated to 400
          characters);
        </li>
        <li>your session token, to authenticate the request.</li>
      </ul>

      <h2>How drafts are produced</h2>
      <p>
        The text above is sent to the language model provider this instance is configured with, and
        that provider returns the draft. That provider processes the text under its own terms and
        privacy policy. If no provider is configured, or the request fails, the service falls back
        to a template built from the commit subjects alone — nothing leaves for a model in that case.
      </p>

      <h2>What the service stores</h2>
      <p>
        The service does not keep accounts, drafts or commit data in a database. Two things are
        persisted:
      </p>
      <ul>
        <li>
          <strong>Your publishing tokens</strong> — a LinkedIn access token and an X access token
          together with its refresh token — each encrypted with AES-256-GCM before it is written. On
          a deployment they live in private Vercel Blobs; when you run the service locally they are
          written to <code>web/.data/linkedin.json</code> and <code>web/.data/x.json</code>. The
          encryption key is held in the server environment, and no token is ever sent to your
          browser.
        </li>
        <li>
          <strong>Short-lived OAuth state</strong>, in the <code>li_state</code>, <code>x_state</code>
          and <code>x_verifier</code> cookies described below.
        </li>
      </ul>
      <p>
        Operational logs from the hosting platform may record request metadata and error messages
        when something fails. Draft text is returned to your CLI and is not retained by the service.
      </p>

      <h2>Publishing to LinkedIn and X</h2>
      <p>
        A post is published only after you choose <strong>Post</strong>, and only to the platforms
        you connect. The approved text is sent to LinkedIn and/or X with your access token; from
        that point it is handled under that platform&apos;s terms and privacy policy, and is visible
        to whoever your account settings allow. If you connect both, the CLI asks which one the post
        should go to.
      </p>
      <p>
        For LinkedIn, shiplog requests the <code>openid profile w_member_social</code> scopes —
        enough to identify your profile and publish a post on your behalf. For X it requests
        <code>tweet.read tweet.write users.read offline.access</code>, which adds the ability to read
        your own account and to refresh an expired access token without sending you back through
        the consent screen. Nothing else is requested on either platform.
      </p>

      <h2>Cookies</h2>
      <p>
        The service sets cookies only while you connect an account: <code>li_state</code> for
        LinkedIn, and <code>x_state</code> plus <code>x_verifier</code> for X. They are
        <code>httpOnly</code>, <code>SameSite=Lax</code>, expire after 10 minutes and exist only to
        protect the OAuth redirect against cross-site request forgery (and, on X, to hold the PKCE
        verifier until the callback). There are no analytics, advertising or tracking cookies on
        this site or in the CLI.
      </p>

      <h2>Who else is involved</h2>
      <ul>
        <li>
          <strong>Hosting and storage</strong> — the site and its API run on Vercel, which also holds
          the encrypted LinkedIn and X tokens.
        </li>
        <li>
          <strong>Model provider</strong> — whichever provider the operator of this instance
          configures, as described above.
        </li>
        <li>
          <strong>LinkedIn and X</strong> — only if you connect them and approve a post.
        </li>
      </ul>
      <p>
        Your data is not sold, rented or shared for advertising. It is disclosed to the providers
        above only to run the features you use, or where the law requires it.
      </p>

      <h2>Keeping and deleting your data</h2>
      <ul>
        <li>
          Each token is kept until you replace it by connecting again, or until it is removed from
          the storage described above. Connecting one platform never overwrites the other.
        </li>
        <li>
          On your own machine, delete <code>~/.config/shiplog/</code> to remove the session and voice
          samples, and <code>.git/shiplog-last</code> to forget your place in a repository.
        </li>
        <li>Posts already published live on LinkedIn or X; delete them there.</li>
      </ul>

      <h2>Security</h2>
      <p>
        Requests travel over HTTPS, both tokens are encrypted at rest, and the CLI stores its
        session token with owner-only permissions. No system is perfectly secure, so treat your
        LinkedIn and X access as you would any other credential and revise it in the platform&apos;s
        settings if you stop using shiplog.
      </p>

      <h2>Children</h2>
      <p>
        shiplog is not intended for anyone under 13, and it should not be used to post from an
        account you are not allowed to publish with.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        If the way shiplog handles data changes, this page will be updated and the date at the top
        will change. Material changes will be called out in the project repository.
      </p>

      <h2>Contact</h2>
      <p>
        Questions, corrections or deletion requests: open an issue at{" "}
        <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
          the shiplog repository
        </a>
        .
      </p>
    </LegalPage>
  );
}
