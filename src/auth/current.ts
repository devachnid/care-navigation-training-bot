import 'server-only';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import type { Actor } from '@/policy/actor';
import { readSessionToken } from './next-cookies';
import { loadActor } from './sessions';

/**
 * Who is asking, or null if not signed in. One query per render (React `cache()`); in server
 * actions and route handlers `cache()` does nothing, so each call checks afresh.
 * A disabled user is not signed in; a deactivated membership or suspended practice leaves
 * `membership` null.
 */
export const getActor = cache(async (): Promise<Actor | null> => loadActor(await readSessionToken()));

/** For pages and actions: the actor, or a redirect to `/sign-in`. */
export const requireActor = cache(async (): Promise<Actor> => {
  const actor = await getActor();
  if (!actor) redirect('/sign-in');
  return actor;
});
