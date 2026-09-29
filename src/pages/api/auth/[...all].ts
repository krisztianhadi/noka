import type { APIRoute } from 'astro';
import { getAuth } from '@/lib/auth';

/** better-auth's own routes: session, Google callback, reset tokens (§15). */
export const ALL: APIRoute = ({ request }) => getAuth().handler(request);
