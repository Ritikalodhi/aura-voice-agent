"use client";
import { useEffect, useRef, useState } from "react";

const TEST_ORDERS = [
  { id: "ORD-101", customer: "Priya Sharma", product: "Vitamin C Serum (30ml)", value: "₹699", status: "Out for Delivery", cls: "out", notes: "BlueDart — BD-982103. Expected by 6 PM today", tryLine: "Where is my order ORD-101? Can I cancel it?" },
  { id: "ORD-102", customer: "Rahul Verma", product: "Hydrating Sunscreen SPF 50", value: "₹499", status: "Delivered", cls: "delivered", notes: "Delhivery — DL-441029. Delivered 14 days ago", tryLine: "I got ORD-102 two weeks ago. Can I return it?" },
  { id: "ORD-103", customer: "Ananya Patel", product: "Green Tea Face Wash + Toner", value: "₹850", status: "Processing", cls: "processing", notes: "Ordered 3 hours ago. Eligible for cancellation", tryLine: "Please cancel ORD-103." },
];

const STATE_LABEL = {
  idle: "Ready to call",
  listening: "Listening",
  thinking: "Thinking",
  speaking: "Speaking",
};

const STATE_HINT = {
  idle: "Press Start Call and speak when you hear Aria.",
  listening: "Go ahead, Aria is listening.",
  thinking: "One moment...",
  speaking: "Aria is replying.",
};

function fmt(s) {
  const m = String(Math.floor(s / 60)).padStart(2, "0");
  const r = String(s % 60).padStart(2, "0");
  return `${m}:${r}`;
}

// Split a reply into short chunks so the first one can start playing early.
function chunkText(t) {
  const parts = t.match(/[^.!?।]+[.!?।]*\s*/g) || [t];
  const out = [];
  let cur = "";
  for (const p of parts) {
    cur += p;
    if (cur.trim().length >= 45) {
      out.push(cur.trim());
      cur = "";
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

async function fetchAudio(text) {
  const res = await fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) throw new Error("tts failed");
  return URL.createObjectURL(await res.blob());
}

export default function Home() {
  const [active, setActive] = useState(false);
  const [agentState, setAgentState] = useState("idle");
  const [messages, setMessages] = useState([]);
  const [summary, setSummary] = useState(null);
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [liveText, setLiveText] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);

  const activeRef = useRef(false);
  const busyRef = useRef(false);
  const messagesRef = useRef([]);
  const recRef = useRef(null);
  const voiceRef = useRef(null);
  const audioRef = useRef(null);
  const chatRef = useRef(null);
  const callIdRef = useRef(0);

  useEffect(() => {
    const pick = () => {
      const v = window.speechSynthesis.getVoices();
      voiceRef.current =
        v.find((x) => x.lang === "en-IN") ||
        v.find((x) => x.lang === "hi-IN") ||
        v.find((x) => x.lang.startsWith("en")) ||
        null;
    };
    pick();
    window.speechSynthesis.onvoiceschanged = pick;
  }, []);

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages, agentState]);

  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [active]);

  function addMessage(role, content) {
    const next = [...messagesRef.current, { role, content }];
    messagesRef.current = next;
    setMessages(next);
  }

  function browserSpeak(text) {
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      if (voiceRef.current) {
        u.voice = voiceRef.current;
        u.lang = voiceRef.current.lang;
      } else {
        u.lang = "en-IN";
      }
      u.rate = 1.05;
      u.onend = resolve;
      u.onerror = resolve;
      window.speechSynthesis.speak(u);
    });
  }

  function playUrl(url) {
    return new Promise((resolve, reject) => {
      const a = new Audio(url);
      audioRef.current = a;
      a.onended = () => {
        URL.revokeObjectURL(url);
        resolve();
      };
      a.onerror = () => reject(new Error("playback failed"));
      a.play().catch(reject);
    });
  }

  async function speak(text, onStart) {
    const spoken = text.replace(/(order\s+)?ORD-(\d+)/gi, "order $2");
    const chunks = chunkText(spoken);
    const jobs = chunks.map((c) => fetchAudio(c).catch(() => null));
    let started = false;
    const begin = () => {
      if (!started) {
        started = true;
        onStart?.();
      }
    };

    for (let i = 0; i < chunks.length; i++) {
      const url = await jobs[i];
      if (!activeRef.current) return;
      begin();
      if (url) {
        try {
          await playUrl(url);
          continue;
        } catch {}
      }
      await browserSpeak(chunks[i]);
    }
  }

  function stopAudio() {
    const a = audioRef.current;
    if (a) {
      a.pause();
      a.dispatchEvent(new Event("ended"));
    }
    window.speechSynthesis.cancel();
  }

  function listen() {
    if (!activeRef.current) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setError("Speech recognition isn't supported in this browser. Open the page in Google Chrome.");
      return;
    }
    const rec = new SR();
    rec.lang = "en-IN";
    rec.interimResults = true;
    rec.continuous = false;
    rec.maxAlternatives = 1;
    let finalTranscript = "";
    let submitted = false;

    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalTranscript += `${t} `;
        else interim += t;
      }
      setLiveText(`${finalTranscript}${interim}`.trim());
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("Microphone is blocked. Allow mic access in the address bar and start again.");
        endCall();
      } else if (e.error === "audio-capture") {
        setError("No microphone was detected. Check your microphone and try again.");
        endCall();
      }
    };
    rec.onend = () => {
      setLiveText("");
      const text = finalTranscript.trim();
      if (text && !submitted) {
        submitted = true;
        handleUser(text);
      } else if (!text && activeRef.current && !busyRef.current) {
        setTimeout(listen, 250);
      }
    };

    recRef.current = rec;
    setAgentState("listening");
    try { rec.start(); } catch {}
  }

  async function handleUser(text) {
    busyRef.current = true;
    setBusy(true);
    addMessage("user", text);
    setAgentState("thinking");

    let reply;
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: messagesRef.current }),
      });
      const data = await res.json();
      reply = data.reply || "Sorry, could you please repeat that?";
    } catch {
      reply = "Sorry, I'm having trouble. Could you please repeat that?";
    }

    if (!activeRef.current) {
      busyRef.current = false;
      setBusy(false);
      return;
    }
    await speak(reply, () => {
      addMessage("assistant", reply);
      setAgentState("speaking");
    });
    busyRef.current = false;
    setBusy(false);
    if (activeRef.current) listen();
  }

  async function startCall() {
    callIdRef.current += 1;
    setError("");
    setSummary(null);
    setSummarizing(false);
    setSeconds(0);
    setLiveText("");
    messagesRef.current = [];
    setMessages([]);
    busyRef.current = true;
    setBusy(true);
    activeRef.current = true;
    setActive(true);
    setAgentState("thinking");

    const greeting = "Hi, this is Aria from Aura Skincare. How can I help you today?";
    await speak(greeting, () => {
      addMessage("assistant", greeting);
      setAgentState("speaking");
    });
    busyRef.current = false;
    setBusy(false);
    if (activeRef.current) listen();
  }

  async function endCall() {
    if (!activeRef.current) return;
    const callId = callIdRef.current;
    activeRef.current = false;
    setActive(false);
    busyRef.current = false;
    setBusy(false);
    setAgentState("idle");
    setLiveText("");
    try { recRef.current?.abort(); } catch {}
    stopAudio();

    setSummarizing(true);
    try {
      const res = await fetch("/api/summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: messagesRef.current }),
      });
      if (callId === callIdRef.current) setSummary(await res.json());
    } catch {
      if (callId === callIdRef.current) setSummary({ error: "Could not generate summary." });
    }
    if (callId === callIdRef.current) setSummarizing(false);
  }

  function onType(e) {
    e.preventDefault();
    const t = typed.trim();
    if (!t || !activeRef.current || busyRef.current) return;
    setTyped("");
    try { recRef.current?.abort(); } catch {}
    stopAudio();
    handleUser(t);
  }

  return (
    <main className="shell">
      <header className="masthead">
        <h1>Aria, Aura Skincare support</h1>
        <p>Talk to Aria about your order, returns, shipping or cash on delivery. Use Chrome and allow the microphone.</p>
      </header>

      <div className="grid">
        <section className="panel stage" aria-live="polite">
          <div className="orb" data-state={agentState}>
            <div className="bars" aria-hidden="true">
              <span /><span /><span /><span /><span />
            </div>
          </div>
          <div className="status">{STATE_LABEL[agentState]}</div>
          <p className="hint">{STATE_HINT[agentState]}</p>
          <p className="live">{liveText ? `“${liveText}”` : "\u00A0"}</p>
          <div className="timer">{active ? fmt(seconds) : seconds > 0 ? `Last call ${fmt(seconds)}` : "\u00A0"}</div>

          <div className="actions">
            <button className="btn btn-start" onClick={startCall} disabled={active}>Start Call</button>
            <button className="btn btn-end" onClick={endCall} disabled={!active}>End Call</button>
          </div>
          {error && <p className="error">{error}</p>}
        </section>

        <section className="panel">
          <h2 className="panel-title">Transcript</h2>
          <div className="chat" ref={chatRef}>
            {messages.length === 0 && (
              <p className="empty">Your conversation with Aria will appear here once the call starts.</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.role === "user" ? "user" : "aria"}`}>
                <small>{m.role === "user" ? "Customer" : "Aria"}</small>
                {m.content}
              </div>
            ))}
            {agentState === "thinking" && messages.length > 0 && (
              <div className="msg aria typing" aria-label="Aria is thinking">
                <span /><span /><span />
              </div>
            )}
          </div>
          <form className="composer" onSubmit={onType}>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={active ? "Mic not working? Type your message here" : "Start a call to chat"}
              disabled={!active}
            />
            <button className="btn btn-send" type="submit" disabled={!active || busy || !typed.trim()}>Send</button>
          </form>
        </section>
      </div>

      <section className="section">
        <h2 className="panel-title">Test orders</h2>
        <div className="orders">
          {TEST_ORDERS.map((o) => (
            <article key={o.id} className="order">
              <h3>{o.id}</h3>
              <p className="who">{o.customer}</p>
              <p>{o.product} · {o.value}</p>
              <p><span className={`chip ${o.cls}`}>{o.status}</span></p>
              <p>{o.notes}</p>
              <p className="try"><span>Try saying:</span> “{o.tryLine}”</p>
            </article>
          ))}
        </div>
      </section>

      {(summarizing || summary) && (
        <section className="section panel">
          <h2 className="panel-title">Call outcome</h2>
          {summarizing ? (
            <p>Summarising the call...</p>
          ) : (
            <>
              {!summary?.error && (
                <div className="outcome-grid">
                  <div><small>Intent</small><b>{summary?.customer_intent}</b></div>
                  <div><small>Order</small><b>{summary?.order_id || "None"}</b></div>
                  <div><small>Status</small><b>{summary?.resolution_status}</b></div>
                </div>
              )}
              <pre className="json">{JSON.stringify(summary, null, 2)}</pre>
            </>
          )}
        </section>
      )}
    </main>
  );
}
// "use client";
// import { useEffect, useRef, useState } from "react";

// const TEST_ORDERS = [
//   { id: "ORD-101", customer: "Priya Sharma", product: "Vitamin C Serum (30ml)", value: "₹699", status: "Out for Delivery", cls: "out", notes: "BlueDart — BD-982103. Expected by 6 PM today", tryLine: "Where is my order ORD-101? Can I cancel it?" },
//   { id: "ORD-102", customer: "Rahul Verma", product: "Hydrating Sunscreen SPF 50", value: "₹499", status: "Delivered", cls: "delivered", notes: "Delhivery — DL-441029. Delivered 14 days ago", tryLine: "I got ORD-102 two weeks ago. Can I return it?" },
//   { id: "ORD-103", customer: "Ananya Patel", product: "Green Tea Face Wash + Toner", value: "₹850", status: "Processing", cls: "processing", notes: "Ordered 3 hours ago. Eligible for cancellation", tryLine: "Please cancel ORD-103." },
// ];

// const STATE_LABEL = {
//   idle: "Ready to call",
//   listening: "Listening",
//   thinking: "Thinking",
//   speaking: "Speaking",
// };

// const STATE_HINT = {
//   idle: "Press Start Call and speak when you hear Aria.",
//   listening: "Go ahead, Aria is listening.",
//   thinking: "Looking that up...",
//   speaking: "Aria is replying.",
// };

// function fmt(s) {
//   const m = String(Math.floor(s / 60)).padStart(2, "0");
//   const r = String(s % 60).padStart(2, "0");
//   return `${m}:${r}`;
// }

// export default function Home() {
//   const [active, setActive] = useState(false);
//   const [agentState, setAgentState] = useState("idle");
//   const [messages, setMessages] = useState([]);
//   const [summary, setSummary] = useState(null);
//   const [summarizing, setSummarizing] = useState(false);
//   const [error, setError] = useState("");
//   const [seconds, setSeconds] = useState(0);

//   const activeRef = useRef(false);
//   const busyRef = useRef(false);
//   const messagesRef = useRef([]);
//   const recRef = useRef(null);
//   const voiceRef = useRef(null);
//   const chatRef = useRef(null);

//   useEffect(() => {
//     const pick = () => {
//       const v = window.speechSynthesis.getVoices();
//       voiceRef.current =
//         v.find((x) => x.lang === "en-IN") ||
//         v.find((x) => x.lang === "hi-IN") ||
//         v.find((x) => x.lang.startsWith("en")) ||
//         null;
//     };
//     pick();
//     window.speechSynthesis.onvoiceschanged = pick;
//   }, []);

//   useEffect(() => {
//     if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
//   }, [messages]);

//   useEffect(() => {
//     if (!active) return;
//     const t = setInterval(() => setSeconds((s) => s + 1), 1000);
//     return () => clearInterval(t);
//   }, [active]);

//   function addMessage(role, content) {
//     const next = [...messagesRef.current, { role, content }];
//     messagesRef.current = next;
//     setMessages(next);
//   }

//   function speak(text) {
//     return new Promise((resolve) => {
//       const spoken = text.replace(/ORD-(\d+)/gi, "order $1");
//       const u = new SpeechSynthesisUtterance(spoken);
//       if (voiceRef.current) {
//         u.voice = voiceRef.current;
//         u.lang = voiceRef.current.lang;
//       } else {
//         u.lang = "en-IN";
//       }
//       u.rate = 1.05;
//       u.onend = resolve;
//       u.onerror = resolve;
//       window.speechSynthesis.speak(u);
//     });
//   }

//   function listen() {
//     if (!activeRef.current) return;
//     const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
//     if (!SR) {
//       setError("Speech recognition isn't supported in this browser. Open the page in Google Chrome.");
//       return;
//     }
//     const rec = new SR();
//     rec.lang = "en-IN";
//     rec.interimResults = false;
//     rec.continuous = false;
//     let got = false;

//     rec.onresult = (e) => {
//       const text = e.results[0][0].transcript.trim();
//       if (text) {
//         got = true;
//         handleUser(text);
//       }
//     };
//     rec.onerror = (e) => {
//       if (e.error === "not-allowed" || e.error === "service-not-allowed") {
//         setError("Microphone is blocked. Allow mic access in the address bar and start again.");
//         endCall();
//       }
//     };
//     rec.onend = () => {
//       if (!got && activeRef.current && !busyRef.current) setTimeout(listen, 200);
//     };

//     recRef.current = rec;
//     setAgentState("listening");
//     try { rec.start(); } catch {}
//   }

//   async function handleUser(text) {
//     busyRef.current = true;
//     addMessage("user", text);
//     setAgentState("thinking");

//     let reply;
//     try {
//       const res = await fetch("/api/chat", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ messages: messagesRef.current }),
//       });
//       const data = await res.json();
//       reply = data.reply || "Sorry, could you please repeat that?";
//     } catch {
//       reply = "Sorry, I'm having trouble. Could you please repeat that?";
//     }

//     if (!activeRef.current) { busyRef.current = false; return; }
//     addMessage("assistant", reply);
//     setAgentState("speaking");
//     await speak(reply);
//     busyRef.current = false;
//     if (activeRef.current) listen();
//   }

//   async function startCall() {
//     setError("");
//     setSummary(null);
//     setSeconds(0);
//     messagesRef.current = [];
//     setMessages([]);
//     busyRef.current = false;
//     activeRef.current = true;
//     setActive(true);

//     const greeting = "Hi, this is Aria from Aura Skincare. How can I help you today?";
//     addMessage("assistant", greeting);
//     setAgentState("speaking");
//     await speak(greeting);
//     if (activeRef.current) listen();
//   }

//   async function endCall() {
//     if (!activeRef.current) return;
//     activeRef.current = false;
//     setActive(false);
//     setAgentState("idle");
//     try { recRef.current?.abort(); } catch {}
//     window.speechSynthesis.cancel();

//     setSummarizing(true);
//     try {
//       const res = await fetch("/api/summary", {
//         method: "POST",
//         headers: { "Content-Type": "application/json" },
//         body: JSON.stringify({ messages: messagesRef.current }),
//       });
//       setSummary(await res.json());
//     } catch {
//       setSummary({ error: "Could not generate summary." });
//     }
//     setSummarizing(false);
//   }

//   return (
//     <main className="shell">
//       <header className="masthead">
//         <h1>Aria, Aura Skincare support</h1>
//         <p>Talk to Aria about your order, returns, shipping or cash on delivery. Use Chrome and allow the microphone.</p>
//       </header>

//       <div className="grid">
//         <section className="panel stage" aria-live="polite">
//           <div className="orb" data-state={agentState}>
//             <div className="bars" aria-hidden="true">
//               <span /><span /><span /><span /><span />
//             </div>
//           </div>
//           <div className="status">{STATE_LABEL[agentState]}</div>
//           <p className="hint">{STATE_HINT[agentState]}</p>
//           <div className="timer">{active ? fmt(seconds) : seconds > 0 ? `Last call ${fmt(seconds)}` : "\u00A0"}</div>

//           <div className="actions">
//             <button className="btn btn-start" onClick={startCall} disabled={active}>Start Call</button>
//             <button className="btn btn-end" onClick={endCall} disabled={!active}>End Call</button>
//           </div>
//           {error && <p className="error">{error}</p>}
//         </section>

//         <section className="panel">
//           <h2 className="panel-title">Transcript</h2>
//           <div className="chat" ref={chatRef}>
//             {messages.length === 0 && (
//               <p className="empty">Your conversation with Aria will appear here once the call starts.</p>
//             )}
//             {messages.map((m, i) => (
//               <div key={i} className={`msg ${m.role === "user" ? "user" : "aria"}`}>
//                 <small>{m.role === "user" ? "Customer" : "Aria"}</small>
//                 {m.content}
//               </div>
//             ))}
//           </div>
//         </section>
//       </div>

//       <section className="section">
//         <h2 className="panel-title">Test orders</h2>
//         <div className="orders">
//           {TEST_ORDERS.map((o) => (
//             <article key={o.id} className="order">
//               <h3>{o.id}</h3>
//               <p className="who">{o.customer}</p>
//               <p>{o.product} · {o.value}</p>
//               <p><span className={`chip ${o.cls}`}>{o.status}</span></p>
//               <p>{o.notes}</p>
//               <p className="try"><span>Try saying:</span> “{o.tryLine}”</p>
//             </article>
//           ))}
//         </div>
//       </section>

//       {(summarizing || summary) && (
//         <section className="section panel">
//           <h2 className="panel-title">Call outcome</h2>
//           {summarizing ? (
//             <p>Summarising the call...</p>
//           ) : (
//             <>
//               {!summary?.error && (
//                 <div className="outcome-grid">
//                   <div><small>Intent</small><b>{summary?.customer_intent}</b></div>
//                   <div><small>Order</small><b>{summary?.order_id || "None"}</b></div>
//                   <div><small>Status</small><b>{summary?.resolution_status}</b></div>
//                 </div>
//               )}
//               <pre className="json">{JSON.stringify(summary, null, 2)}</pre>
//             </>
//           )}
//         </section>
//       )}
//     </main>
//   );
// }