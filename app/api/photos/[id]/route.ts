import { createClient } from "@/lib/supabase/server";
import { getObject } from "@/lib/storage/r2";

/**
 * Serves a card photo to its owner. The row is read with the session client,
 * so RLS proves ownership on every request: a photo the caller cannot see is
 * indistinguishable from one that does not exist. Lives outside
 * `app/[locale]/` so `proxy.ts` leaves it unprefixed.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const supabase = await createClient();
  const { data } = await supabase
    .from("card_photos")
    .select("object_key, content_type")
    .eq("id", id)
    .maybeSingle();
  if (!data?.object_key) return new Response(null, { status: 404 });

  const object = await getObject(data.object_key);
  if (!object) return new Response(null, { status: 404 });

  return new Response(object.body, {
    headers: {
      "Content-Type": data.content_type,
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
