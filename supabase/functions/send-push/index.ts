import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { supabaseAdmin } from "../_shared/supabase-client.ts";
import { CORS_HEADERS } from "../_shared/cors.ts";

const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") ?? "mailto:admin@pritio.app";
const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";

interface SendPushPayload {
  userId: string;
  title: string;
  body: string;
  url?: string;
}

interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      return new Response(JSON.stringify({ error: "VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY secrets are required" }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const { userId, title, body, url }: SendPushPayload = await req.json();

    if (!userId || !title) {
      return new Response(JSON.stringify({ error: "userId and title required" }), {
        status: 400,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const supabase = supabaseAdmin;
    const { data: subscriptions, error } = await supabase
      .from("push_subscriptions")
      .select("endpoint, p256dh, auth")
      .eq("user_id", userId);

    if (error) {
      console.error("Error fetching subscriptions:", error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const payloadBytes = new TextEncoder().encode(JSON.stringify({ title, body, url }));
    const vapidPublicKey = base64UrlToUint8Array(VAPID_PUBLIC_KEY);
    const vapidPrivateKey = base64UrlToUint8Array(VAPID_PRIVATE_KEY);

    let sent = 0;
    for (const sub of subscriptions as PushSubscriptionRow[]) {
      try {
        const encrypted = await encryptPayload(sub, payloadBytes);
        const jwt = await generateVapidJwt(VAPID_SUBJECT, vapidPublicKey, vapidPrivateKey, new URL(sub.endpoint).origin);

        const res = await fetch(sub.endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Encoding": "aes128gcm",
            "TTL": "86400",
            "Authorization": `vapid t=${jwt}, k=${VAPID_PUBLIC_KEY}`,
          },
          body: encrypted,
        });

        if (res.ok) {
          sent++;
        } else if (res.status === 410 || res.status === 404) {
          await supabase
            .from("push_subscriptions")
            .delete()
            .eq("endpoint", sub.endpoint);
          console.warn("Removed stale subscription:", sub.endpoint, res.status);
        } else {
          console.warn("Push endpoint responded", res.status, await res.text());
        }
      } catch (err) {
        console.error("Error sending push:", err);
      }
    }

    return new Response(JSON.stringify({ sent, total: subscriptions.length }), {
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("send-push error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }
});

// ─── Encoding helpers ──────────────────────────────────────

function base64UrlToUint8Array(input: string): Uint8Array {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function uint8ArrayToBase64Url(arr: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function concatBytes(...arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const a of arrays) {
    out.set(a, offset);
    offset += a.length;
  }
  return out;
}

// ─── Web Push (RFC 8291 aes128gcm) via Web Crypto ─────────

async function hmac(keyBytes: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, data));
}

async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  const t1 = await hmac(prk, concatBytes(info, new Uint8Array([1])));
  return t1.subarray(0, length);
}

async function encryptPayload(sub: PushSubscriptionRow, plaintext: Uint8Array): Promise<Uint8Array> {
  const uaPublicRaw = base64UrlToUint8Array(sub.p256dh);
  const authSecret = base64UrlToUint8Array(sub.auth);
  const textEncoder = new TextEncoder();

  const ephemeral = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPublicRaw = new Uint8Array(await crypto.subtle.exportKey("raw", ephemeral.publicKey));

  const uaX = uaPublicRaw.subarray(1, 33);
  const uaY = uaPublicRaw.subarray(33, 65);
  const uaPublic = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x: uint8ArrayToBase64Url(uaX), y: uint8ArrayToBase64Url(uaY) },
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );

  const sharedSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaPublic }, ephemeral.privateKey, 256),
  );

  const prkShared = await hmac(authSecret, sharedSecret);
  const keyInfo = concatBytes(textEncoder.encode("WebPush: info\x00"), uaPublicRaw, asPublicRaw);
  const ikm = await hkdfExpand(prkShared, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prkKey = await hmac(salt, ikm);
  const cek = await hkdfExpand(prkKey, textEncoder.encode("Content-Encoding: aes128gcm\x00"), 16);
  const nonce = await hkdfExpand(prkKey, textEncoder.encode("Content-Encoding: nonce\x00"), 12);

  const record = concatBytes(new Uint8Array([0x02]), plaintext);
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, aesKey, record),
  );

  const rs = new Uint8Array([0, 0, 0, 0]);
  const keyIdLen = new Uint8Array([asPublicRaw.length]);
  return concatBytes(salt, rs, keyIdLen, asPublicRaw, ciphertext);
}

// ─── VAPID JWT (ES256) ─────────────────────────────────────

async function generateVapidJwt(
  subject: string,
  publicKey: Uint8Array,
  privateKey: Uint8Array,
  audience: string,
): Promise<string> {
  const textEncoder = new TextEncoder();
  const header = uint8ArrayToBase64Url(textEncoder.encode('{"typ":"JWT","alg":"ES256"}'));
  const now = Math.floor(Date.now() / 1000);
  const payload = uint8ArrayToBase64Url(
    textEncoder.encode(JSON.stringify({ aud: audience, exp: now + 12 * 3600, sub: subject })),
  );
  const signingInput = `${header}.${payload}`;

  const jwk: JsonWebKey = {
    kty: "EC",
    crv: "P-256",
    x: uint8ArrayToBase64Url(publicKey.subarray(1, 33)),
    y: uint8ArrayToBase64Url(publicKey.subarray(33, 65)),
    d: uint8ArrayToBase64Url(privateKey.subarray(0, 32)),
  };

  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const signature = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, textEncoder.encode(signingInput)),
  );

  return `${signingInput}.${uint8ArrayToBase64Url(signature)}`;
}
