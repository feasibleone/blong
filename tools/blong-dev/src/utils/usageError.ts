/**
 * A usage error, thrown by the command layer and printed by the command that owns
 * the usage text.
 *
 * Commands share helpers that validate their input (a title that is too long, an
 * unknown area), and a helper cannot know which command's usage text applies. So it
 * throws this, and the top-level `catch` in the command prints the message with its
 * own usage and sets the exit code.
 */
export class UsageError extends Error {}
