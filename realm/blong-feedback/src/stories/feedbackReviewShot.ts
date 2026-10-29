/**
 * The capture the review story shows (`@@T-474`).
 *
 * Apart from `feedbackReviewFixture.ts` on purpose: this module imports an image,
 * which a bundler turns into a URL and Node refuses to load at all, so the fixture —
 * which the stub's own test reads — must not reach it (`@@T-499`).
 */
import feedbackShot from './img/feedbackShot.jpg';

/** The picture a real session stored: a browse page's table header, 847 × 320. */
export const FIXTURE_SHOT = feedbackShot;
