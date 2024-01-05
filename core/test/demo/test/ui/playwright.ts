export default (blong): unknown =>
    function playwright() {
        return [
            {
                params: {__dirname},
                name: 'utCore.playwright',
                result() {},
            },
            blong.config?.type === 'unit' && 'portal.playwright.run',
        ];
    };
