import {handler} from '@feasibleone/blong';

export default handler(({lib: {error}}) => {
    const errors = error({'parking.invalidZone': 'Invalid zone'});
    return {
        parkingTest({zone}: {zone: string}) {
            if (!['blue', 'green'].includes(zone)) throw errors['parking.invalidZone']();
            return {
                zone,
                price: {blue: 2, green: 1}[zone],
            };
        },
    };
});
