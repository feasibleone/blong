import {handler} from '@feasibleone/blong';

export default handler<
    object,
    {
        subjectModels?: object;
    }
>(() => ({
    subjectModelList() {
        return this.config?.context?.subjectModels ?? {};
    },
}));
