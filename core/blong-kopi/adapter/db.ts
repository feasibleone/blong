import {adapter} from '@feasibleone/blong';

export default adapter<object>(api => ({
    extends: 'adapter.knex',
}));
