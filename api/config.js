// Non-secret facts the page needs before anyone types: whether a conversation
// can be kept at all, and whether the provider behind the questions uses what
// people type to train on.
//
// That second one exists because the page makes a promise, and a promise about
// data has to follow the deployment rather than be written once into the HTML
// and then quietly go out of date. Set PROVIDER_TRAINS_ON_INPUT=1 whenever the
// configured provider or tier does that, and the page says so itself.
//
// Read the provider's own terms to decide. As of this writing Google's Gemini
// API terms say unpaid use is used "to provide, improve, and develop Google
// products and services" and may be read by human reviewers, while paid use is
// not. Anthropic's API does not train on API inputs.

import { kvEnabled } from "./_limits.js";
import { accessEnabled } from "./_access.js";

export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    contributionsPossible: kvEnabled,
    providerTrainsOnInput: process.env.PROVIDER_TRAINS_ON_INPUT === "1",
    // Whether a pin is needed. Saying so here rather than in the HTML means
    // the gate can be turned on and off without a code change, and the page
    // never shows a pin screen for a tool that is not actually locked.
    accessRequired: accessEnabled()
  });
}
