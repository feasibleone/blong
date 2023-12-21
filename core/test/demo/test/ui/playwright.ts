export default fo => function playwright() {
    return [
        {
            params: {__dirname},
            name: 'utCore.playwright',
            result() {}
        },
        fo.config?.type === 'unit' && 'portal.playwright.run'
    ];
};
