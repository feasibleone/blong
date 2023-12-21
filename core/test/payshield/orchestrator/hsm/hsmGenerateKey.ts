import { handler } from '@feasibleone/blong';

export default handler(({
    lib: {
        generateKey
    }
}) => ({
    'hsm.generateKey': generateKey
}));
