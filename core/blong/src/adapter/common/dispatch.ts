import { adapter } from '../../../types.js';

export default adapter<object>(() => ({
    async init(...configs) {
        await super.init({
            type: 'dispatch'
        }, ...configs);
    },
    start() {
        super.connect();
        return super.start();
    }
}));
