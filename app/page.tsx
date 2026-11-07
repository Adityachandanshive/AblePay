"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type IntentResponse = {
  pendingId: string | null;
  speech: string;
  preview: {
    type: "P2P_TRANSFER" | "SPLIT_BILL" | "REQUEST_MONEY";
    total: string;
    recipients: { id: string; name: string; email: string }[];
    perRecipient: { recipient: string; amount: string }[];
    note: string | null;
    expiresAt: number;
  } | null;
};

type HistoryItem = {
  id: string;
  status: "completed" | "cancelled" | "failed";
  type: "P2P_TRANSFER" | "SPLIT_BILL" | "REQUEST_MONEY";
  amountCentsTotal: number;
  recipients: { id: string; name: string; email: string }[];
  createdAt: number;
};

const contacts = [
  { name: "Sam", email: "sb-sam-personal@example.com" },
  { name: "Sarah", email: "sb-sarah-personal@example.com" },
  { name: "Mom", email: "sb-mom-personal@example.com" }
];

export default function HomePage() {
  const [mode, setMode] = useState<"toggle" | "push">("toggle");
  const [status, setStatus] = useState<"Idle" | "Listening" | "Thinking" | "Speaking" | "Done">("Idle");
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [textInput, setTextInput] = useState("");
  const [speech, setSpeech] = useState("Welcome to AblePay. Speak a payment request to begin.");
  const [preview, setPreview] = useState<IntentResponse["preview"]>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [level, setLevel] = useState(0);
  const [largeText, setLargeText] = useState(false);
  const [permissionMessage, setPermissionMessage] = useState<string | null>(null);
  const [autoListenAfterSpeech, setAutoListenAfterSpeech] = useState(false);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const levelStyle = useMemo(() => ({ width: `${Math.max(5, Math.min(100, level * 100))}%` }), [level]);

  const stopMeter = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    setLevel(0);
  }, []);

  const startMeter = useCallback(() => {
    if (!analyserRef.current) return;

    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    const tick = () => {
      if (!analyserRef.current) return;
      analyserRef.current.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i += 1) {
        const value = data[i];
        const normalized = (value - 128) / 128;
        sum += normalized * normalized;
      }
      setLevel(Math.sqrt(sum / data.length) * 2);
      rafRef.current = requestAnimationFrame(tick);
    };

    tick();
  }, []);

  const fetchHistory = useCallback(async () => {
    const response = await fetch("/api/history", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    setHistory(payload.transactions || []);
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const speak = useCallback(async (text: string, autoListen = false) => {
    setSpeech(text);
    setStatus("Speaking");
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      if (!response.ok) throw new Error("Speech synthesis failed");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      if (audioRef.current) {
        audioRef.current.pause();
      }

      const audio = new Audio(url);
      audioRef.current = audio;
      await audio.play();

      await new Promise<void>((resolve) => {
        audio.onended = () => {
          URL.revokeObjectURL(url);
          resolve();
        };
      });

      if (autoListen) {
        setAutoListenAfterSpeech(true);
      }
      setStatus("Done");
    } catch {
      setStatus("Done");
    }
  }, []);

  const sendIntentText = useCallback(
    async (text: string) => {
      if (!text.trim()) return;

      setTranscript(text);
      setStatus("Thinking");

      const response = await fetch("/api/intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });

      const payload: IntentResponse = await response.json();
      setPreview(payload.preview || null);
      setPendingId(payload.pendingId || null);
      await speak(payload.speech, Boolean(payload.pendingId));
      await fetchHistory();
    },
    [fetchHistory, speak]
  );

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }, []);

  const stopRecording = useCallback(async () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") return;

    const recorder = mediaRecorderRef.current;
    recorder.stop();
    setIsRecording(false);
    stopMeter();

    await new Promise<void>((resolve) => {
      recorder.onstop = async () => {
        try {
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          chunksRef.current = [];

          const formData = new FormData();
          formData.append("audio", blob, "voice.webm");

          const sttResponse = await fetch("/api/stt", { method: "POST", body: formData });
          if (!sttResponse.ok) {
            throw new Error("Speech-to-text failed");
          }

          const sttPayload = await sttResponse.json();
          const text = (sttPayload.text || "").trim();
          if (!text) {
            await speak("I did not catch that. Please try again.");
          } else {
            await sendIntentText(text);
          }
        } catch {
          setPermissionMessage("Voice capture failed. You can continue using text input.");
          setStatus("Done");
        } finally {
          stopTracks();
          resolve();
        }
      };
    });
  }, [sendIntentText, speak, stopMeter, stopTracks]);

  const startRecording = useCallback(async () => {
    if (isRecording) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const audioContext = new AudioContext();
      const source = audioContext.createMediaStreamSource(stream);
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;

      const recorder = new MediaRecorder(stream, { mimeType: "audio/webm" });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };

      recorder.start();
      setPermissionMessage(null);
      setStatus("Listening");
      setIsRecording(true);
      startMeter();
    } catch {
      setPermissionMessage("Microphone access was denied. Use the text fallback to continue.");
      setStatus("Done");
    }
  }, [isRecording, startMeter]);

  useEffect(() => {
    if (!autoListenAfterSpeech) return;

    setAutoListenAfterSpeech(false);
    void startRecording();
  }, [autoListenAfterSpeech, startRecording]);

  const toggleRecording = useCallback(async () => {
    if (isRecording) {
      await stopRecording();
    } else {
      await startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  const confirmDecision = useCallback(
    async (decision: "confirm" | "cancel") => {
      if (!pendingId) return;
      setStatus("Thinking");
      const response = await fetch("/api/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pendingId, decision })
      });
      const payload = await response.json();
      setPreview(null);
      setPendingId(null);
      await speak(payload.speech || "Done");
      await fetchHistory();
    },
    [fetchHistory, pendingId, speak]
  );

  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      if (event.code === "Space") {
        event.preventDefault();
        await toggleRecording();
      }
      if (event.key === "Enter" && pendingId) {
        event.preventDefault();
        await confirmDecision("confirm");
      }
      if (event.key === "Escape" && pendingId) {
        event.preventDefault();
        await confirmDecision("cancel");
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [confirmDecision, pendingId, toggleRecording]);

  return (
    <main className={`${largeText ? "large-text" : ""} min-h-screen bg-white text-[#111]`}>
      <div className="bg-black px-4 py-2 text-center text-xs font-semibold tracking-wide text-white">SANDBOX MODE • NO REAL MONEY</div>

      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/95 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4">
          <a className="brand-font text-2xl font-bold focus-ring" href="#">
            AblePay
          </a>
          <nav className="hidden items-center gap-6 text-sm font-semibold uppercase md:flex">
            <a className="focus-ring" href="#voice">
              Pay
            </a>
            <a className="focus-ring" href="#voice">
              Split
            </a>
            <a className="focus-ring" href="#activity">
              History
            </a>
            <a className="focus-ring" href="#contacts">
              Contacts
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <button
              className="focus-ring rounded-full border border-gray-300 px-3 py-2 text-sm"
              onClick={() => setLargeText((value) => !value)}
              type="button"
            >
              {largeText ? "A-" : "A+"}
            </button>
            <span aria-hidden className="text-lg">
              🔍
            </span>
            <span aria-hidden className="text-lg">
              👤
            </span>
          </div>
        </div>
      </header>

      <section className="bg-gradient-to-b from-[#f5f5f5] to-white px-4 py-14">
        <div className="mx-auto max-w-6xl">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-gray-600">Voice-native payments</p>
          <h1 className="brand-font text-5xl font-bold leading-[0.9] md:text-8xl">Speak. Confirm. Sent.</h1>
          <button
            className="focus-ring mt-8 rounded-full bg-black px-7 py-4 text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-gray-800"
            onClick={toggleRecording}
            type="button"
          >
            Start Talking
          </button>
        </div>
      </section>

      <section className="px-4 py-10" id="voice">
        <div className="mx-auto max-w-6xl rounded-3xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm font-semibold uppercase tracking-wide">Status: {status}</p>
            <div className="flex gap-2">
              <button
                className="focus-ring rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold"
                onClick={() => setMode((current) => (current === "toggle" ? "push" : "toggle"))}
                type="button"
              >
                Mode: {mode === "toggle" ? "Tap-to-toggle" : "Push-to-talk"}
              </button>
              <button
                className="focus-ring rounded-full border border-gray-300 px-4 py-2 text-sm font-semibold"
                onClick={() => speak(speech)}
                type="button"
              >
                Replay
              </button>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center gap-4">
            <button
              aria-label={isRecording ? "Stop recording" : "Start recording"}
              className={`focus-ring relative h-40 w-40 rounded-full border border-gray-300 bg-black text-white transition ${
                isRecording ? "shadow-[0_0_0_14px_rgba(250,84,0,0.35)]" : ""
              }`}
              onMouseDown={mode === "push" ? startRecording : undefined}
              onMouseUp={mode === "push" ? stopRecording : undefined}
              onMouseLeave={mode === "push" ? stopRecording : undefined}
              onClick={mode === "toggle" ? toggleRecording : undefined}
              type="button"
            >
              <span className="text-lg font-semibold uppercase">Mic</span>
              {isRecording && <span className="absolute inset-0 animate-ping rounded-full border border-[#FA5400]" />}
            </button>
            <div className="h-3 w-full max-w-lg rounded-full bg-gray-200">
              <div className="h-full rounded-full bg-[#FA5400] transition-all" style={levelStyle} />
            </div>
          </div>

          <div className="mt-6 rounded-2xl bg-[#f5f5f5] p-4" role="status">
            <p className="text-sm font-medium">Transcript</p>
            <p className="mt-2 text-base">{transcript || "Waiting for your command..."}</p>
          </div>

          {permissionMessage && <p className="mt-4 text-sm text-[#FA5400]">{permissionMessage}</p>}

          <form
            className="mt-4 flex gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              await sendIntentText(textInput);
              setTextInput("");
            }}
          >
            <input
              aria-label="Type a payment command"
              className="focus-ring min-h-12 flex-1 rounded-full border border-gray-300 px-4 py-3"
              onChange={(event) => setTextInput(event.target.value)}
              placeholder="Type command, e.g. Send $20 to Sam for pizza"
              value={textInput}
            />
            <button className="focus-ring min-h-12 rounded-full bg-black px-5 text-sm font-semibold text-white hover:bg-gray-800" type="submit">
              Send
            </button>
          </form>

          {preview && (
            <div className="mt-6 rounded-2xl border border-gray-300 p-5">
              <p className="brand-font text-xl">Evon Preview</p>
              <p className="mt-2 text-sm uppercase text-gray-500">{preview.type.replaceAll("_", " ")}</p>
              <p className="mt-1 text-3xl font-semibold">${preview.total}</p>
              <ul className="mt-3 space-y-2 text-sm">
                {preview.perRecipient.map((item) => (
                  <li className="flex justify-between" key={`${item.recipient}-${item.amount}`}>
                    <span>{item.recipient}</span>
                    <span>${item.amount}</span>
                  </li>
                ))}
              </ul>
              {preview.note && <p className="mt-2 text-sm text-gray-700">Note: {preview.note}</p>}
              <div className="mt-4 flex gap-2">
                <button
                  className="focus-ring min-h-12 rounded-full bg-black px-5 py-3 text-sm font-semibold text-white hover:bg-gray-800"
                  onClick={() => confirmDecision("confirm")}
                  type="button"
                >
                  Confirm
                </button>
                <button
                  className="focus-ring min-h-12 rounded-full border border-black px-5 py-3 text-sm font-semibold text-black"
                  onClick={() => confirmDecision("cancel")}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      <section className="px-4 py-10" id="contacts">
        <div className="mx-auto grid max-w-6xl gap-5 md:grid-cols-3">
          {contacts.map((contact) => (
            <article
              className="group rounded-2xl border border-gray-200 p-5 transition duration-200 hover:-translate-y-1 hover:shadow-md"
              key={contact.email}
            >
              <div className="mb-4 flex h-40 items-center justify-center rounded-xl bg-gradient-to-br from-gray-200 to-gray-100 text-3xl font-bold uppercase">
                {contact.name.slice(0, 1)}
              </div>
              <p className="brand-font text-2xl">{contact.name}</p>
              <p className="mt-1 text-sm text-gray-600">{contact.email}</p>
              <button
                className="focus-ring mt-4 min-h-12 rounded-full bg-black px-5 py-2 text-sm font-semibold uppercase text-white hover:bg-gray-800"
                onClick={async () => sendIntentText(`Send twenty dollars to ${contact.name} for lunch`)}
                type="button"
              >
                Pay
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className="px-4 py-10" id="activity">
        <div className="mx-auto max-w-6xl">
          <h2 className="brand-font text-3xl">Recent Activity</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {history.length === 0 && <p className="text-sm text-gray-600">No activity yet.</p>}
            {history.map((item) => (
              <article className="rounded-2xl border border-gray-200 p-4 shadow-sm transition hover:-translate-y-0.5" key={item.id}>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{item.type.replaceAll("_", " ")}</p>
                <p className="mt-2 text-2xl font-semibold">${(item.amountCentsTotal / 100).toFixed(2)}</p>
                <p className="mt-1 text-sm text-gray-600">{item.recipients.map((r) => r.name).join(", ")}</p>
                <p className="mt-3 text-sm font-medium">{item.status}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="mt-10 bg-black px-4 py-10 text-white">
        <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-4">
          <div>
            <p className="brand-font text-2xl">AblePay</p>
            <p className="mt-2 text-sm text-gray-300">Voice-native payments for everyone.</p>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase">Product</p>
            <ul className="mt-3 space-y-2 text-sm text-gray-300">
              <li>Pay</li>
              <li>Split</li>
              <li>History</li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase">Developers</p>
            <ul className="mt-3 space-y-2 text-sm text-gray-300">
              <li>API</li>
              <li>Sandbox</li>
              <li>Docs</li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase">Support</p>
            <ul className="mt-3 space-y-2 text-sm text-gray-300">
              <li>Accessibility</li>
              <li>Security</li>
              <li>Contact</li>
            </ul>
          </div>
        </div>
      </footer>

      <div aria-live="polite" className="sr-only">
        {speech}
      </div>
    </main>
  );
}
