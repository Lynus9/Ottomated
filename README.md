# Ottomated

A single-screen coming-soon page. Plain HTML, CSS, and inline SVG; no runtime JavaScript, dependencies, external fonts, or build step. The decorative character and its orbital bead are CSS animations, with a still composition for `prefers-reduced-motion`.

## Local preview

The GitHub-connected checkout is `C:\Users\bucka\Documents\Ottomated\Ottomated` (inside the working folder).

With Node.js 18 or newer installed, run in PowerShell:

```powershell
Set-Location 'C:\Users\bucka\Documents\Ottomated\Ottomated'
npm run dev
```

Open **http://localhost:3000**. Stop the server with **Ctrl+C**. No `npm install` is needed. Alternatively, open `public/index.html` directly in a browser.

## Deploy to Cloudflare Pages — when approved

Nothing has been deployed. The following steps publish the page, so carry them out only when ready to make it public.

1. Commit and push this checkout to `https://github.com/Lynus9/Ottomated.git`.
2. In Cloudflare **Workers & Pages**, create a **Pages** project, connect GitHub, and select **Lynus9/Ottomated**.
3. Select the branch you pushed and use these settings:

   | Setting | Value |
   | --- | --- |
   | Framework preset | None |
   | Root directory | Leave empty (repository root) |
   | Build command | `exit 0` |
   | Build output directory | `public` |

4. Save and deploy. Check the supplied `pages.dev` address.
5. In the Pages project's **Custom domains**, choose **Set up a custom domain** and enter **ottomated.ca**. Follow Cloudflare's DNS and certificate instructions. For this apex domain, the domain must be a zone in the same Cloudflare account, with its nameservers pointing to Cloudflare. Review existing DNS records before changing nameservers, preserving records needed for email or other services.

Git integration automatically deploys future pushes to the production branch. The `public` folder also works with Cloudflare's direct upload option; upload its contents so `index.html` is at the deployment root.

Only `public/` is served. `public/_headers` supplies basic response security headers on Cloudflare Pages. The local preview server is for development and does not interpret that Cloudflare-specific file.

References: [Cloudflare static HTML guide](https://developers.cloudflare.com/pages/framework-guides/deploy-anything/) and [custom domains guide](https://developers.cloudflare.com/pages/configuration/custom-domains/).
