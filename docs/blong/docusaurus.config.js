// @ts-check
// `@type` JSDoc annotations allow editor autocompletion and type checking
// (when paired with `@ts-check`).
// There are various equivalent ways to declare your Docusaurus config.
// See: https://docusaurus.io/docs/api/docusaurus-config

import {themes as prismThemes} from 'prism-react-renderer';

// Page-view analytics for the published site. The build is what decides, so a maintainer or
// a deploy sets the measurement ID in its environment: unset — the default — builds the site
// with no analytics at all, which keeps a local `npm run build` and `npm start` silent. The
// reports this repository publishes read the same variable family (`BLONG_ALLURE_GA_ID`),
// but deliberately not the same name (@@D-565).
const trackingID = (process.env.BLONG_DOCS_GA_ID ?? '').trim();

/** @type {import('@docusaurus/types').Config} */
const config = {
    title: 'Blong',
    tagline: 'API and DRY focused RAD framework',
    favicon: 'img/favicon.ico',
    url: 'http://blong.feasible.one',
    baseUrl: '/',

    organizationName: 'feasibleone', // Usually your GitHub org/user name.
    projectName: 'blong-docs', // Usually your repo name.
    deploymentBranch: 'main',
    trailingSlash: false,

    onBrokenLinks: 'throw',

    i18n: {
        defaultLocale: 'en',
        locales: ['en'],
    },

    markdown: {
        mermaid: true,
        hooks: {
            onBrokenMarkdownLinks: 'warn',
        },
    },

    themes: ['@docusaurus/theme-mermaid'],

    headTags: [
        {
            tagName: 'link',
            attributes: {
                rel: 'icon',
                sizes: '32x32',
                href: 'img/manta32.png',
            },
        },
        {
            tagName: 'link',
            attributes: {
                rel: 'icon',
                sizes: '64x64',
                href: 'img/manta64.png',
            },
        },
    ],

    presets: [
        [
            'classic',
            /** @type {import('@docusaurus/preset-classic').Options} */
            ({
                docs: {
                    sidebarPath: './sidebars.js',
                    // editUrl: 'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
                },
                blog: {
                    showReadingTime: true,
                    blogTitle: 'Blong Blog',
                    blogDescription: 'Blog blong Blong',
                    postsPerPage: 'ALL',
                    blogSidebarTitle: 'All posts',
                    blogSidebarCount: 'ALL',
                    // editUrl: 'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
                },
                theme: {
                    customCss: './src/css/custom.css',
                },
                // Only added when a measurement ID was given: the preset enables the plugin
                // for whatever it is handed, including an empty string, which would build a
                // site that reports nowhere.
                ...(trackingID ? {gtag: {trackingID, anonymizeIP: true}} : {}),
            }),
        ],
    ],

    themeConfig:
        /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
        ({
            // Replace with your project's social card
            image: 'img/blong-social-card.jpg',
            navbar: {
                title: 'Blong',
                logo: {
                    alt: 'Blong Logo',
                    src: 'img/manta200.png',
                },
                items: [
                    {
                        type: 'docSidebar',
                        sidebarId: 'tutorialSidebar',
                        position: 'left',
                        label: 'Docs',
                    },
                    {to: '/blog', label: 'Blog', position: 'left'},
                    {
                        href: 'https://github.com/feasibleone/blong',
                        label: 'GitHub',
                        position: 'right',
                    },
                ],
            },
            // footer: {
            //     style: 'dark',
            //     links: [
            //         {
            //             title: 'Docs',
            //             items: [
            //                 {
            //                     label: 'Docs',
            //                     to: '/docs/intro',
            //                 },
            //             ],
            //         },
            //         {
            //             title: 'Community',
            //             items: [
            //                 {
            //                     label: 'Stack Overflow',
            //                     href: 'https://stackoverflow.com/questions/tagged/docusaurus',
            //                 },
            //                 {
            //                     label: 'Discord',
            //                     href: 'https://discordapp.com/invite/docusaurus',
            //                 },
            //                 {
            //                     label: 'Twitter',
            //                     href: 'https://twitter.com/docusaurus',
            //                 },
            //             ],
            //         },
            //         {
            //             title: 'More',
            //             items: [
            //                 {
            //                     label: 'Blog',
            //                     to: '/blog',
            //                 },
            //                 {
            //                     label: 'GitHub',
            //                     href: 'https://github.com/facebook/docusaurus',
            //                 },
            //             ],
            //         },
            //     ],
            // },
            prism: {
                theme: prismThemes.vsLight,
                darkTheme: prismThemes.vsDark,
            },
        }),
};

export default config;
