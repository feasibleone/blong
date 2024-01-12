// @ts-check
// `@type` JSDoc annotations allow editor autocompletion and type checking
// (when paired with `@ts-check`).
// There are various equivalent ways to declare your Docusaurus config.
// See: https://docusaurus.io/docs/api/docusaurus-config

import {themes as prismThemes} from 'prism-react-renderer';

/** @type {import('@docusaurus/types').Config} */
const config = {
    title: 'Blong',
    tagline: 'API focused RAD framework',
    favicon: 'img/favicon.ico',
    url: 'https://feasibleone.github.io',
    baseUrl: '/blong-docs/',

    organizationName: 'feasibleone', // Usually your GitHub org/user name.
    projectName: 'blong', // Usually your repo name.
    deploymentBranch: 'gh-pages',
    trailingSlash: false,

    onBrokenLinks: 'throw',
    onBrokenMarkdownLinks: 'warn',

    i18n: {
        defaultLocale: 'en',
        locales: ['en'],
    },

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
                    // editUrl: 'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
                },
                theme: {
                    customCss: './src/css/custom.css',
                },
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
