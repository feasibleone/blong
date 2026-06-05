import {handler} from '@feasibleone/blong';

export default handler(({schema}) => ({
    subjectObjectSchema({subject, object}: {subject: string; object?: string}) {
        return (
            (object ? {properties: {[object]: schema[subject]?.[object]}} : schema[subject]) ?? {}
        );
    },
}));
