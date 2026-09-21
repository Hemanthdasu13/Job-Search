// A WhatsApp link that does not put the number in the page.
//
// A wa.me link carries the number in the URL itself — wa.me/447700900123 is
// the number, written out. Putting one in the HTML publishes it: to anyone
// reading the source, to anyone hovering the link, and to every crawler that
// harvests public pages for phone numbers.
//
// So the link on the page points here instead, and this redirects. The number
// lives in an environment variable, which never reaches the browser until
// someone actually clicks — at which point they are a human who wants to
// message you, which is the entire point. A crawler reading the HTML sees a
// path on your own domain and nothing else.
//
// This is not secrecy and does not pretend to be: anyone who clicks sees the
// number, because WhatsApp needs it to open a chat. What it removes is the
// case where nobody clicked and the number was collected anyway.
//
//   WHATSAPP_NUMBER   digits only, with country code, no + and no spaces.
//                     e.g. 447700900123
//   WHATSAPP_TEXT     optional message to prefill.
//
// Unset means the link is not offered at all: /api/config says so and the
// page removes it rather than rendering something that goes nowhere.

const DEFAULT_TEXT = "Hi Hemanth, could I have a key for the AI verification tool?";

export function whatsappNumber() {
  // Tolerate a number pasted with the punctuation people naturally include.
  return String(process.env.WHATSAPP_NUMBER || "").replace(/[^0-9]/g, "");
}

export function whatsappConfigured() {
  const n = whatsappNumber();
  // Shortest plausible international number is about eight digits; longest is
  // fifteen. Anything outside that is a typo, and a redirect to a mistyped
  // number is worse than no link, because it fails silently in WhatsApp.
  return n.length >= 8 && n.length <= 15;
}

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  // Never let this end up in a search index or a crawler's link graph.
  res.setHeader("X-Robots-Tag", "noindex, nofollow");

  if (!whatsappConfigured()) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end("Not found");
  }

  const text = process.env.WHATSAPP_TEXT || DEFAULT_TEXT;
  const target = `https://wa.me/${whatsappNumber()}?text=${encodeURIComponent(text)}`;

  // 302 rather than 301: a permanent redirect gets cached by browsers and
  // proxies, and a number that can never be changed without people holding a
  // stale copy is the wrong trade for a contact link.
  res.statusCode = 302;
  res.setHeader("Location", target);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  // A body, because a redirect with an empty one looks broken in the rare
  // client that does not follow it.
  return res.end(`<!doctype html><meta charset="utf-8"><title>Opening WhatsApp</title>` +
    `<p>Opening WhatsApp… <a href="${target}">continue</a></p>`);
}
