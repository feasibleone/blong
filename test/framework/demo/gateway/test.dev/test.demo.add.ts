import {validation} from '@feasibleone/blong';

/**
 * Demo of the `.dev`-group convention: a gateway validation placed in a
 * handler-group folder ending in `.dev` (here `gateway/test.dev/`) is loaded
 * only under the `dev` intent. Under any other intent the folder is skipped, so
 * the `test.demo.add` route does not exist.
 *
 * Note: this must be a `.dev`-suffixed handler group folder. Putting the file in
 * a plain `gateway/test/` folder does NOT make it dev-only — `test` there is a
 * regular handler group inside the `gateway` layer and loads whenever the layer
 * loads.
 */
export default validation(
    async ({lib: {type}}) =>
        function testDemoAdd() {
            return {
                auth: false,
                params: type.Any(),
                result: type.Any(),
            };
        },
);
