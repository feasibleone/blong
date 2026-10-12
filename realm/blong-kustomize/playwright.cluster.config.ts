/**
 * Playwright against a *deployed* operator: nothing is started here.
 *
 * The page and its read API are served by the operator's own gateway, reached through a port-forward
 * (`kubectl -n blong-system port-forward deploy/blong-operator 8098:8080`), and the login is the cluster's
 * (D-376): the password field carries a service-account token and the operator verifies it with a
 * TokenReview. Temporary while the committed shape is decided.
 */
import {defineBlongConfig} from '@feasibleone/blong-browser/playwright/config';

const port = Number(process.env['BLONG_CLUSTER_PORT'] ?? 8098);

export default defineBlongConfig({
    // No dev server and no local backend: the operator is both.
    webServer: [],
    backendPort: port,
    frontendPort: port,
    testDir: './test-cluster',
    use: {screenshot: 'on'},
    /**
     * A budget the size of noise, because this is the page the screenshots exist for.
     *
     * The framework's own is a *share of the image* — a hundredth of a 1600x900 page is about
     * fourteen thousand pixels — and that was wide enough for an error dialog and a missing table
     * row together: a baseline that showed `Error / Not Found` over an empty table went on passing
     * against a page listing a Deployment, so it stayed a day old in the file, wrong, while the
     * suite reported green (F-507). A page one browser renders on one OS is a deterministic image,
     * so what is left to tolerate here is anti-aliasing; what the screenshot is for is differences.
     * The wait budget is restated because this block replaces the framework's, and a spec that
     * asserts after a round trip through the gateway is what that budget was added for.
     */
    expect: {
        timeout: 15_000,
        toHaveScreenshot: {maxDiffPixels: 50},
    },
});
