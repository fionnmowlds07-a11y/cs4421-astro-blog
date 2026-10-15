// @ts-check

import mdx from '@astrojs/mdx';
import node from '@astrojs/node';
import sitemap from '@astrojs/sitemap';
import { defineConfig, envField, fontProviders } from 'astro/config';

// https://astro.build/config
export default defineConfig({
    site: 'https://example.com',
    output: 'server',
    adapter: node({
        mode: 'standalone',
    }),
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
