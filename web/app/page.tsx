"use client";

import Image from "next/image";
import { FormEvent, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const APP_STORE_URL = "https://apps.apple.com/us/app/glance/id6760528040";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type FormState = "idle" | "submitting" | "success" | "error";
type WidgetSize = "large" | "medium" | "small";

type WidgetImage = {
  src: string;
  alt: string;
  line: string;
  position?: string;
};

const WIDGET_IMAGES: WidgetImage[] = [
  {
    src: "/widget-images/glance-moment.jpg",
    alt: "A rooftop sunset moment overlooking the city.",
    line: "stay a little longer",
    position: "50% 48%"
  },
  {
    src: "/widget-images/background_20260704151805_001.jpg",
    alt: "A mountaintop snapshot above a blue cloud layer.",
    line: "up here, it counts",
    position: "50% 56%"
  },
  {
    src: "/widget-images/background_20260704152047_002.jpg",
    alt: "Two friends in alpine gear on a snowy ridge.",
    line: "bring the cold energy",
    position: "50% 54%"
  },
  {
    src: "/widget-images/background_20260704151930_002.jpg",
    alt: "A happy dog on an open beach path under a huge sky.",
    line: "go outside first",
    position: "50% 58%"
  },
  {
    src: "/widget-images/background_20260704151807_001.jpg",
    alt: "A dog in a soft green meadow with blue hills behind it.",
    line: "tiny good day",
    position: "50% 58%"
  },
  {
    src: "/widget-images/background_20260701162607_003.jpg",
    alt: "Kids running through a bright playground at sunset.",
    line: "run it back",
    position: "50% 56%"
  },
  {
    src: "/widget-images/background_20260701162548_003.jpg",
    alt: "Two hikers moving through a golden rainforest trail.",
    line: "keep moving",
    position: "50% 56%"
  },
  {
    src: "/widget-images/background_20260617175928_001.jpg",
    alt: "Two ducklings in a sunny puddle at golden hour.",
    line: "small wins",
    position: "50% 56%"
  },
  {
    src: "/widget-images/background_20260617181021_001.jpg",
    alt: "Two golden retriever puppies in tall grass.",
    line: "make it easy",
    position: "50% 57%"
  },
  {
    src: "/widget-images/background_20260615212305_001.jpg",
    alt: "Three kittens in a cozy room with window light.",
    line: "begin again",
    position: "50% 54%"
  },
  {
    src: "/widget-images/background_20260617174932_001.jpg",
    alt: "Two baby goats in a rolling green field.",
    line: "full send, softly",
    position: "50% 56%"
  },
  {
    src: "/widget-images/background_20260615204946_005.jpg",
    alt: "A flash-lit night street food stand moment.",
    line: "after dark still counts",
    position: "50% 50%"
  },
  {
    src: "/widget-images/background_20260630155031_001.jpg",
    alt: "A rooftop city skyline at a warm sunset.",
    line: "one more good thing",
    position: "50% 50%"
  }
];

const INITIAL_WIDGETS = [0, 2, 5];

function quietErrorMessage(message: string) {
  const lower = message.toLowerCase();

  if (lower.includes("duplicate") || lower.includes("unique")) {
    return "You are already on the list.";
  }

  return "Could not join right now.";
}

function pickWidgetIndexes(previous: number[]) {
  const pool = WIDGET_IMAGES.map((_, index) => index);

  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
  }

  const firstPass = pool.filter((index) => !previous.includes(index));
  const next = [...firstPass, ...pool].slice(0, 3);

  return next.length === 3 ? next : INITIAL_WIDGETS;
}

function RefreshIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="buttonIcon">
      <path
        d="M20 6v5h-5M4 18v-5h5M18.1 9A7 7 0 0 0 6.8 6.7L4 9.3M5.9 15a7 7 0 0 0 11.3 2.3L20 14.7"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="buttonIcon">
      <path
        d="M16.6 12.4c0-2.2 1.8-3.2 1.9-3.3-1-1.5-2.6-1.7-3.1-1.7-1.3-.1-2.6.8-3.3.8s-1.8-.8-2.9-.7c-1.5 0-2.9.9-3.7 2.2-1.6 2.8-.4 6.9 1.1 9.1.8 1.1 1.7 2.4 2.9 2.3 1.1 0 1.6-.7 3-.7s1.8.7 3 .7c1.2 0 2-1.1 2.8-2.2.9-1.3 1.2-2.5 1.2-2.6 0-.1-2.8-1.1-2.9-3.9ZM14.5 6c.6-.8 1.1-1.8 1-2.9-.9 0-2 .6-2.6 1.4-.6.7-1.1 1.8-1 2.8 1 .1 2-.5 2.6-1.3Z"
        fill="currentColor"
      />
    </svg>
  );
}

function Widget({
  image,
  size,
  priority
}: {
  image: WidgetImage;
  size: WidgetSize;
  priority?: boolean;
}) {
  return (
    <article className={`widget widget-${size}`} aria-label={`${size} widget preview`}>
      <Image
        src={image.src}
        alt={image.alt}
        fill
        sizes={
          size === "large"
            ? "(max-width: 760px) 52vw, 320px"
            : size === "medium"
              ? "(max-width: 760px) 52vw, 320px"
              : "(max-width: 760px) 24vw, 152px"
        }
        priority={priority}
        className="widgetImage"
        style={{ objectPosition: image.position ?? "50% 55%" }}
      />
      <div className="widgetShade" />
      <div className="widgetCopy">
        <span className="widgetKicker">{size === "small" ? "now" : "today"}</span>
        <p>{image.line}</p>
      </div>
    </article>
  );
}

export default function Home() {
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [widgetIndexes, setWidgetIndexes] = useState(INITIAL_WIDGETS);
  const [refreshing, setRefreshing] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<FormState>("idle");
  const [message, setMessage] = useState("");

  const widgets = useMemo(
    () => widgetIndexes.map((index) => WIDGET_IMAGES[index]),
    [widgetIndexes]
  );

  function refreshWidgets() {
    setWidgetIndexes((current) => pickWidgetIndexes(current));
    setRefreshing(true);
    window.setTimeout(() => setRefreshing(false), 190);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!trimmedName) {
      setStatus("error");
      setMessage("Add your name.");
      return;
    }

    if (!EMAIL_PATTERN.test(normalizedEmail)) {
      setStatus("error");
      setMessage("Add a real email.");
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      setStatus("error");
      setMessage("Waitlist is not connected yet.");
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
    setMessage("You are on the list.");
  }

  return (
    <main className="page" aria-labelledby="glance-title">
      <section className="hero">
        <div className="brandLockup">
          <Image src="/glance-icon.png" alt="" width={42} height={42} priority />
          <h1 id="glance-title">Glance</h1>
        </div>

        <div className={`widgetStage ${refreshing ? "isRefreshing" : ""}`}>
          <Widget image={widgets[0]} size="large" priority />
          <Widget image={widgets[1]} size="small" priority />
          <Widget image={widgets[2]} size="medium" priority />
        </div>

        <div className="controls">
          <button type="button" className="secondaryButton" onClick={refreshWidgets}>
            <RefreshIcon />
            Refresh widgets
          </button>
        </div>

        <div className="actions" aria-label="Glance app actions">
          <a href={APP_STORE_URL} rel="noreferrer" className="primaryButton">
            <AppleIcon />
            Download on the App Store
          </a>
          <button
            type="button"
            className="primaryButton lightButton"
            aria-expanded={waitlistOpen}
            onClick={() => {
              setWaitlistOpen((current) => !current);
              setStatus((current) => (current === "submitting" ? current : "idle"));
              setMessage("");
            }}
          >
            Join Android waitlist
          </button>
        </div>

        <form
          className={`waitlist ${waitlistOpen ? "waitlistOpen" : ""}`}
          onSubmit={handleSubmit}
          aria-hidden={!waitlistOpen}
        >
          <label>
            <span>Name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="name"
              disabled={!waitlistOpen || status === "submitting" || status === "success"}
            />
          </label>
          <label>
            <span>Email</span>
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
            className="submitButton"
            disabled={!waitlistOpen || status === "submitting" || status === "success"}
          >
            {status === "submitting" ? "Joining" : "Join"}
          </button>
          <p className={`formNote ${status === "error" ? "formError" : ""}`} aria-live="polite">
            {message}
          </p>
        </form>
      </section>
    </main>
  );
}
