# Ottomated

A single-screen landing page with a contact modal, plus a focused How We Work page. Plain HTML, CSS, inline SVG, and small JavaScript files; no dependencies or compilation step. The purple character and its orbital bead remain CSS animations. Reduced-motion preferences disable motion effects.

## Local preview

The GitHub-connected checkout is `C:\Users\bucka\Documents\Ottomated\Ottomated` (inside the working folder).

With Node.js 18 or newer installed, run in PowerShell:

```powershell
Set-Location 'C:\Users\bucka\Documents\Ottomated\Ottomated'
npm run dev
```

Open **http://localhost:3000**. Stop the server with **Ctrl+C**. No `npm install` is needed. If port 3000 is in use, set `$env:PORT = '3001'` before running the command.

Preview the new page at **http://localhost:3000/how-we-work** (or port 3001 if selected). You can also follow **How We Work** from the homepage, and use the arrow/Ottomated link to return home.

Use the HTTP preview for the contact form, rather than opening the HTML from disk. The preview serves JavaScript with the correct content type and applies the global security headers from `public/_headers`, matching the production static assets.

## How We Work

`public/how-we-work.html` contains the four-step process, with the shared brand styles in `styles.css` and page-specific styles in `process.css`. `process.js` extends a fine vertical line and moves a small mint marker as visitors scroll. The numbered steps illuminate as the line reaches them. Text is always visible, and reduced-motion or JavaScript-off visitors get a complete static timeline. Scroll and resize events share a single animation-frame update, with no animation library or continuous rendering loop.

The homepage layout, animation, contact markup, and Formspree script are preserved. Its only new element is the quiet **How We Work** link in the upper-right corner. The process page's back link returns to the existing homepage and contact form.

Cloudflare Workers' default static HTML handling serves `public/how-we-work.html` at `/how-we-work`, including direct navigation and refresh. The local preview server resolves extensionless HTML paths as well. Assets on the process page use root-relative URLs so they also work with a trailing slash. No Worker routing code or deployment configuration was added. See [Cloudflare HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/).

## Contact form

The **Contact Us** button opens a native modal dialog. It supports X, Escape, outside clicks, keyboard focus trapping, and focus restoration to the trigger. Unsent drafts survive closing and reopening while the page stays loaded; nothing is stored persistently.

`public/contact.js` validates required values and email format, then sends `name`, `email`, and `message` using `FormData`, `fetch()`, and `Accept: application/json` to:

```text
https://formspree.io/f/mzeevpda
```

Sending disables editing and duplicate submissions. Only an HTTP success with Formspree's `ok: true` response reveals the confirmation and clears the fields. Server field errors, other failures, and unexpected responses preserve the draft. A 20-second timeout reports that delivery could not be confirmed. Requests are never retried automatically, and redirects are rejected rather than navigating away.

Spam filtering and email notifications are handled by the existing Formspree configuration. There is no backend, email library, extra CAPTCHA, or additional service.

The CSP permits only local JavaScript and the specified Formspree endpoint for network requests. Native form navigation remains blocked because submissions must stay asynchronous.

## Automated checks

With **Node.js 22 or newer** and **Microsoft Edge or Google Chrome** installed:

```powershell
npm test
```

The dependency-free browser tests start their own local server and isolated headless browser. Every external request is intercepted before network access: Formspree responses are mocked, and **no live submissions are sent**. On systems where the browser is not discovered automatically, set `BROWSER_EXECUTABLE` to its full executable path. The restricted Codex environment may need permission to launch browser subprocesses.

Coverage includes five viewport sizes, existing animation, modal closing methods, Tab/Shift+Tab, focus restoration, required/email validation, FormData and headers, field errors, HTTP 422/429/500, network failures, malformed or unconfirmed success responses, duplicate submission prevention, closing during a pending request, successful confirmation, and reduced motion. Process-page checks cover direct URLs, refresh, homepage/back navigation, metadata, accessible list structure, scroll progression, small screens, reduced motion, and a JavaScript-off fallback. Screenshots are saved in the ignored `.preview/contact-tests/` directory. JavaScript syntax is also checked.

This is a buildless static project: the production artifact is the existing `public/` directory. There is no framework production build to run.

## Existing production deployment

The live website is **https://ottomated.ca**, deployed from GitHub to Cloudflare Workers. Keep the existing GitHub/Workers deployment configuration and static asset directory (`public`). This checkout contains no local Wrangler configuration. No new Worker, backend route, hosting project, DNS changes, or deployment configuration is needed for the contact form.

**Do not push to the production branch or deploy until approved:** GitHub integration may automatically publish pushes. The contact form changes have only been tested locally.

Cloudflare serves the static response headers from `public/_headers`. This change adds permission for `public/contact.js` and requests to the existing Formspree endpoint; the remaining restrictions are retained.

## Verify one real submission reaches Google Workspace

1. In the existing Formspree form's dashboard, confirm that its notification recipient is your intended Google Workspace email address and that any required email verification is complete.
2. Start the local preview with `npm run dev`, open **Contact Us**, and enter your name, a real reply-to email address, and a unique message such as **Ottomated contact test - [date/time]**.
3. Click **Send Message** once. This is a real submission and counts toward your Formspree allowance. Wait for **Message sent!**; that confirms Formspree accepted it, not that Google has delivered the notification.
4. Find the same unique message in the Formspree submissions dashboard and in your Google Workspace inbox. If it is missing from the inbox, check Gmail Spam/All Mail and Formspree's notification recipient/settings before sending another test.
5. If Formspree restricts submissions to the production domain, test after the approved deployment or from an allowed preview origin. An origin/CAPTCHA restriction will be shown as a failure; this frontend does not bypass it.

After an approved deployment, the same single-submission check can be performed on `ottomated.ca`. No live submission has been sent by the automated checks.

References: [Formspree AJAX documentation](https://help.formspree.io/hc/en-us/articles/360013470814-Submit-forms-with-JavaScript-AJAX), [Formspree manual fetch example](https://formspree.io/blog/formspree-ajax/), and [Cloudflare Workers static headers](https://developers.cloudflare.com/workers/static-assets/headers/).
