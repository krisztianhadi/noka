/** Shared plumbing for the owner-plane endpoints. */

export function ownerRedirect(location: string): Response {
  return new Response(null, { status: 303, headers: { location, 'cache-control': 'no-store' } });
}
