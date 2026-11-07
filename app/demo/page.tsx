"use client";

import { useState } from "react";

const sampleCommands = [
  "Send twenty dollars to Sam for pizza",
  "Split this 60 dollar dinner between me Sam and Sarah",
  "Request 15 dollars from Mom for groceries"
];

export default function DemoPage() {
  const [output, setOutput] = useState<string>("Click any command to run the full intent flow.");

  const runCommand = async (text: string) => {
    const intentResponse = await fetch("/api/intent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });

    const intentPayload = await intentResponse.json();
    if (!intentPayload.pendingId) {
      setOutput(intentPayload.speech || "Unable to parse command.");
      return;
    }

    const confirmResponse = await fetch("/api/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendingId: intentPayload.pendingId, decision: "confirm" })
    });

    const confirmPayload = await confirmResponse.json();
    setOutput(confirmPayload.speech || "Done");
  };

  return (
    <main className="min-h-screen bg-[#111] px-4 py-12 text-white">
      <div className="mx-auto max-w-4xl">
        <h1 className="brand-font text-5xl">AblePay Demo Commands</h1>
        <p className="mt-3 text-sm text-gray-300">Designed for hackathon judges. Works in MOCK_MODE=true.</p>

        <div className="mt-8 grid gap-4">
          {sampleCommands.map((command) => (
            <button
              className="focus-ring min-h-12 rounded-full border border-white px-5 py-3 text-left text-sm font-semibold uppercase transition hover:bg-white hover:text-black"
              key={command}
              onClick={() => runCommand(command)}
              type="button"
            >
              {command}
            </button>
          ))}
        </div>

        <div className="mt-8 rounded-2xl border border-gray-600 bg-black/50 p-5">
          <p className="text-xs uppercase tracking-wide text-gray-400">Result</p>
          <p className="mt-2 text-lg">{output}</p>
        </div>
      </div>
    </main>
  );
}
