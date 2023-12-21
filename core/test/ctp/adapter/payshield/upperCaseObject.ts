import { library } from '@feasibleone/blong';

export default library(proxy => function upperCaseObject(data, nonCorrectableFields) {
    return Object.keys(data).reduce((acc, curr) => {
        const param = (!nonCorrectableFields[curr] && typeof data[curr] === 'string' && data[curr].toUpperCase()) || data[curr];
        return Object.assign(acc, {[curr]: param});
    }, {});
});
