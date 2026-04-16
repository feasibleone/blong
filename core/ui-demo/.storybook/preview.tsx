import {makePreview} from '@feasibleone/blong-browser/storybook.ts';

import coral from '../marine/model/coral.js';
import family from '../marine/model/family.js';
import habitat from '../marine/model/habitat.js';
import species from '../marine/model/species.js';

export default makePreview({models: [coral(), family(), habitat(), species()]});
