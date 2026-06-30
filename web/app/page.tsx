"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const APP_STORE_URL = "https://apps.apple.com/us/app/glance/id6760528040";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FormState = "idle" | "submitting" | "success" | "error";

function quietErrorMessage(message: string) {
  const lower = message.toLowerCase();
  if (lower.includes("duplicate") || lower.includes("unique")) {
    return "you’re already on the list.";
  }
  return "couldn’t join right now.";
}

export default function Home() {
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<FormState>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!trimmedName) {
      setStatus("error");
      setMessage("add your name.");
      return;
    }

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setStatus("error");
      setMessage("add a real email.");
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      setStatus("error");
      setMessage("waitlist is not connected yet.");
      return;
    }

    setStatus("submitting");
    setMessage("");

    const { error } = await supabase.from("android_waitlist").insert({
      name: trimmedName,
      email: normalizedEmail
    });

    if (error) {
      const copy = quietErrorMessage(error.message);
      setStatus(copy.includes("already") ? "success" : "error");
      setMessage(copy);
      return;
    }

    setStatus("success");
    setMessage("you’re on the list.");
  }

  return (
    <main className="page" aria-labelledby="glance-title">
      <div className="brandRow" aria-label="glance">
        <Image src="/glance-icon.png" alt="" width={28} height={28} priority />
        <span>glance</span>
      </div>

      <section className="stage">
        <div className="momentWrap" aria-hidden="true">
          <Image
            className="moment"
            src="/glance-moment.png"
            alt=""
            width={1024}
            height={1024}
            sizes="(max-width: 700px) 68vw, 38vw"
            priority
          />
        </div>

        <div className="copy">
          <h1 id="glance-title">something to glance at.</h1>
          <div className="actions" aria-label="download options">
            <a href={APP_STORE_URL} rel="noreferrer" className="textAction">
              download on ios
            </a>
            <span aria-hidden="true">·</span>
            <button
              type="button"
              className="textAction"
              aria-expanded={waitlistOpen}
              onClick={() => {
                setWaitlistOpen(true);
                setStatus((current) => (current === "submitting" ? current : "idle"));
                setMessage("");
              }}
            >
              android waitlist
            </button>
          </div>
        </div>

        <form
          className={`waitlist ${waitlistOpen ? "waitlistOpen" : ""}`}
          onSubmit={handleSubmit}
          aria-hidden={!waitlistOpen}
        >
          <label>
            <span>name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              disabled={!waitlistOpen || status === "submitting" || status === "success"}
            />
          </label>
          <label>
            <span>email</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              inputMode="email"
              disabled={!waitlistOpen || status === "submitting" || status === "success"}
            />
          </label>
          <button
            type="submit"
            className="submit"
            disabled={!waitlistOpen || status === "submitting" || status === "success"}
          >
            {status === "submitting" ? "joining" : "join"}
          </button>
          <p className={`formNote ${status === "error" ? "formError" : ""}`} aria-live="polite">
            {message}
          </p>
        </form>
      </section>
    </main>
  );
}
