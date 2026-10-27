// @ts-check

import mdx from '@astrojs/mdx';
import node from '@astrojs/node';
import sitemap from '@astrojs/sitemap';
import { defineConfig, envField, fontProviders } from 'astro/config';

// https://astro.build/config
export default defineConfig({
    // The site's real address, used for canonical links, the RSS feed and the sitemap.
    site: 'https://blog.fionnmowlds.website',
    output: 'server',
    adapter: node({
        mode: 'standalone',
    }),
    security: {
        // checkOrigin (on by default) rejects form posts from other websites, e.g. a fake login form.
        // It compares the Origin header with the site's own address, and the Node server only trusts the
        // incoming Host header for domains listed here (otherwise it assumes "localhost"). Add the real
        // domain when the site is deployed, or logging in there will be refused.
        checkOrigin: true,
        // On AWS the site is reached on my domain (blog.), on the load balancer directly (lb.), or on its CloudFront
        // address (dxxxx.cloudfront.net), which changes every time the environment is created, so any single
        // CloudFront subdomain is trusted. CloudFront passes the visitor's address in X-Forwarded-Host.
        allowedDomains: [
            { hostname: 'localhost' },
            { hostname: '127.0.0.1' },
            { hostname: 'blog.fionnmowlds.website' },
            { hostname: 'lb.fionnmowlds.website' },
            { hostname: '*.cloudfront.net' },
        ],
    },
    // The blog moved to /about-me and replaced the template /about page; keep old links (and RSS readers) working.
    redirects: {
        '/about': '/about-me',
        '/blog': '/about-me',
        '/blog/[...slug]': '/about-me/[...slug]',
    },
    // Typed environment config (12-factor: config lives in the environment, not the code).
    // Server-only secrets are read at runtime, so they are never bundled into the build or sent to the browser.
    env: {
        schema: {
            // Optional so the site still runs without it; the Man United page then shows a fallback message.
            FOOTBALL_DATA_API_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
            // Supabase for the rowing section (ADR-002). 'secret' so they're read at runtime, never baked into
            // the build or sent to the browser; optional so the site (and CI) still runs without a database.
            SUPABASE_URL: envField.string({ context: 'server', access: 'secret', optional: true, url: true }),
            SUPABASE_PUBLISHABLE_KEY: envField.string({ context: 'server', access: 'secret', optional: true }),
        },
    },
    integrations: [mdx(), sitemap()],
    fonts: [
        {
            provider: fontProviders.local(),
            name: 'Atkinson',
            cssVariable: '--font-atkinson',
            fallbacks: ['sans-serif'],
            options: {
                variants: [
                    {
                        src: ['./src/assets/fonts/atkinson-regular.woff'],
                        weight: 400,
                        style: 'normal',
                        display: 'swap',
                    },
                    {
                        src: ['./src/assets/fonts/atkinson-bold.woff'],
                        weight: 700,
                        style: 'normal',
                        display: 'swap',
                    },
                ],
            },
        },
    ],
});
