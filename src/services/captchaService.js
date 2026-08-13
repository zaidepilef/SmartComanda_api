import { env } from "../config/env.js";

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstileToken(token, remoteIp) {
  if (!token || !env.turnstileSecretKey) {
    return false;
  }

  const form = new URLSearchParams();
  form.append("secret", env.turnstileSecretKey);
  form.append("response", token);

  if (remoteIp) {
    form.append("remoteip", remoteIp);
  }

  try {
    const response = await fetch(TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form,
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json();
    return data.success === true;
  } catch {
    return false;
  }
}