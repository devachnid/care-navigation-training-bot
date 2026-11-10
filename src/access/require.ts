import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { TRAINEE_COOKIE, verifyTrainee } from './cookie';

/** The signed-in trainee's name, or null. PoC only: this is a shared code plus a typed name, not authentication. */
export async function currentTrainee(): Promise<string | null> {
  const store = await cookies();
  return verifyTrainee(store.get(TRAINEE_COOKIE)?.value, process.env.ACCESS_CODE ?? '');
}

/** For pages: sends anyone not signed in back to the front page. */
export async function requireTrainee(): Promise<string> {
  const name = await currentTrainee();
  if (!name) redirect('/');
  return name;
}
