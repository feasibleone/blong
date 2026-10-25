import {validation} from '@feasibleone/blong';

/**
 * `sport.athlete.add` — the flat profile payload.
 *
 * The generated validation knows only the profile table, so it would demand a
 * PK the caller never sends and refuse the person fields. The override admits
 * the flat shape; the handler splits it across `party_person` and
 * `sport_athlete`. @@D-596
 */
export default validation(
    async ({lib: {type}}) =>
        function sportAthleteAdd() {
            return {
                params: type.Object({
                    athlete: type.Object({}, {additionalProperties: true}),
                }),
                result: type.Object({athlete: type.Object({}, {additionalProperties: true})}),
            };
        },
);
