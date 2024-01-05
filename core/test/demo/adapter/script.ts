import dispatch from 'ut-function.dispatch';

export default dispatch({
    namespace: 'db/subject',
    methods: {
        subjectObjectPredicate3(dispatched: unknown) {
            return {
                dispatched,
            };
        },
    },
});
