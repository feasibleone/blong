export default (blong: {config?: {type?: unknown}}): unknown =>
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
