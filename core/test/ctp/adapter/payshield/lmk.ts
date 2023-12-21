import { library } from '@feasibleone/blong';

export default library(proxy => function lmk(data: {lmkIdentifier: number | ''}) {
    const {lmkIdentifier} = data;
    const params = (lmkIdentifier === '' || isNaN(lmkIdentifier)) ? {
        delimiterLmkLen: 0,
        delimiterLmk: '',
        lmkIdentifierLen: 0,
        lmkIdentifier: ''
    } : {
        delimiterLmk: '%',
        delimiterLmkLen: 1,
        lmkIdentifier: `00${lmkIdentifier}`.slice(-2),
        lmkIdentifierLen: 2
    };
    return {...data, ...params};
});
