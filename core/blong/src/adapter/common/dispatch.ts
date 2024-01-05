import {adapter} from '../../../types.js';

export default adapter<object>(() => ({
    async init(...configs: object[]) {
        await super.init({type: 'dispatch'}, ...configs);
    },
    start() {
        super.connect();
        return super.start();
    },
}));
