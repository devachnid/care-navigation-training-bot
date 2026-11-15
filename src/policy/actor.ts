export type Role = 'trainee' | 'manager';

/**
 * Who is asking, as resolved by `getActor()` from the sign-in session.
 * `membership` is the active practice, and is null when there is none or when the membership is
 * deactivated or the practice suspended: so "has a membership" means "is an active member of an
 * unsuspended practice".
 */
export type Actor = {
  userId: string;
  name: string;
  email: string;
  isPlatformAdmin: boolean;
  membership: {
    practiceId: string;
    practiceName: string;
    role: Role;
    canApproveScenarios: boolean;
  } | null;
};

/** An actor that is known to be acting in a practice. */
export type MemberActor = Actor & { membership: NonNullable<Actor['membership']> };
