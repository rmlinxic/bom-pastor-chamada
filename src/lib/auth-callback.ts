/** Keep Supabase's token fragment separate from the HashRouter route. */
export function authCallbackFragment(hash: string): string | null {
  const fragment = hash.replace(/^#\/redefinir-senha(?:#|&|\?)/, "#");
  if (!fragment.startsWith("#") || fragment.startsWith("#/")) return null;
  const params = new URLSearchParams(fragment.slice(1));
  if (!params.has("access_token") && !params.has("error")) return null;
  return fragment;
}
