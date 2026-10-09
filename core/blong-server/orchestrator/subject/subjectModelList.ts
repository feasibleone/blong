import {handler} from '@feasibleone/blong';
import {subjectModelFind} from '../../subjectModels.ts';

export default handler(() => ({
    subjectModelList() {
        return subjectModelFind();
    },
}));
