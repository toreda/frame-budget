/**
 * Handle returned by a {@link FrameBroker} registration call.
 *
 * Invoking it removes the registration it came from (e.g. unregisters the
 * worker) and performs any broker-side housekeeping that removal entails. It is
 * **idempotent**: calling it more than once is safe and a no-op after the first.
 *
 * @returns `true` if this call performed the removal, `false` if there was
 *   nothing to remove (already unsubscribed, or the registration was gone).
 */
export type Unsubscribe = () => boolean;
