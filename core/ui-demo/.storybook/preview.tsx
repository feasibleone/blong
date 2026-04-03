import type { Preview } from '@storybook/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import 'primeicons/primeicons.css';
import { PrimeReactProvider } from 'primereact/api';
import 'primereact/resources/primereact.min.css';
import 'primereact/resources/themes/lara-light-blue/theme.css';

const queryClient = new QueryClient({
    defaultOptions: {queries: {retry: false}},
});

const preview: Preview = {
    decorators: [
        Story => (
            <QueryClientProvider client={queryClient}>
                <PrimeReactProvider>
                    <div style={{padding: '1rem'}}>
                        <Story />
                    </div>
                </PrimeReactProvider>
            </QueryClientProvider>
        ),
    ],
    parameters: {
        actions: {argTypesRegex: '^on[A-Z].*'},
        controls: {
            matchers: {color: /(background|color)$/i, date: /Date$/},
        },
    },
};

export default preview;
