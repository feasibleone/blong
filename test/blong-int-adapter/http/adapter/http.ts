import {adapter} from '@feasibleone/blong';

export default adapter<{
    url?: string;
}>(() => ({
    extends: 'adapter.http',
    activation: {
        default: {
            url: 'http://127.0.0.1:30088',
            namespace: 'echo',
            imports: [],
        },
    },
}));
