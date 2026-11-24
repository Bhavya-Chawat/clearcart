"""ClearCart optional backend: LLM classification, complaint drafting, ElevenLabs TTS proxy.

Run:  uvicorn main:app --reload --port 8001
The extension works fully without this server; it only adds AI features and keeps API keys server-side.
"""
import json
import os
import re

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

load_dotenv()

LLM_PROVIDER = os.getenv("LLM_PROVIDER", "anthropic").lower()  # anthropic | openai (any OpenAI-compatible API)
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "claude-haiku-5-5" if LLM_PROVIDER == "anthropic" else "gpt-4o-mini")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "https://api.openai.com/v1")
ELEVEN_KEY = os.getenv("ELEVENLABS_API_KEY", "")
ELEVEN_VOICE = os.getenv("ELEVENLABS_VOICE_ID", "")

PATTERN_IDS = [
    "false_urgency", "basket_sneaking", "confirm_shaming", "forced_action", "subscription_trap",
    "interface_interference", "bait_and_switch", "drip_pricing", "disguised_advertisement", "nagging",
    "trick_question", "saas_billing", "rogue_malpractices",
]

app = FastAPI(title="ClearCart backend")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


class Snippet(BaseModel):
    id: str
    text: str
    context: str = ""


class ClassifyReq(BaseModel):
    snippets: list[Snippet]


class ComplaintReq(BaseModel):
    site: str
    url: str
    findings: list[dict] = []
    prices: dict = {}
    evidence: list[dict] = []


class TTSReq(BaseModel):
    text: str
    lang: str = "en"


async def llm(prompt: str, max_tokens: int = 800) -> str:
    if not LLM_API_KEY:
        raise RuntimeError("no LLM key")
    async with httpx.AsyncClient(timeout=30) as c:
        if LLM_PROVIDER == "anthropic":
            r = await c.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": LLM_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={"model": LLM_MODEL, "max_tokens": max_tokens, "messages": [{"role": "user", "content": prompt}]},
            )
            r.raise_for_status()
            return "".join(b.get("text", "") for b in r.json()["content"])
        r = await c.post(
            LLM_BASE_URL.rstrip("/") + "/chat/completions",
            headers={"Authorization": f"Bearer {LLM_API_KEY}"},
            json={"model": LLM_MODEL, "max_tokens": max_tokens, "messages": [{"role": "user", "content": prompt}]},
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]


HEURISTICS = [
    ("confirm_shaming", re.compile(r"no thanks|i (like|prefer|don'?t want)|risk|pay full", re.I)),
    ("nagging", re.compile(r"maybe later|not now|remind me", re.I)),
    ("forced_action", re.compile(r"sign ?up to continue|login to view|share contacts", re.I)),
    ("subscription_trap", re.compile(r"auto-?renew|cancel anytime\*|free trial", re.I)),
]


def heuristic(snippets: list[Snippet]):
    out = []
    for s in snippets:
        for pid, rx in HEURISTICS:
            if rx.search(s.text):
                out.append({"id": s.id, "patternId": pid, "confidence": 0.6, "reason": "keyword heuristic"})
                break
        else:
            out.append({"id": s.id, "patternId": None, "confidence": 0.0, "reason": "no match"})
    return out


@app.get("/health")
def health():
    return {"ok": True, "llm": bool(LLM_API_KEY), "tts": bool(ELEVEN_KEY)}


@app.post("/classify")
async def classify(req: ClassifyReq):
    snippets = req.snippets[:20]
    prompt = (
        "You classify short UI text snippets from shopping websites into India's CCPA dark-pattern categories.\n"
        f"Allowed patternId values: {', '.join(PATTERN_IDS)} or null if not a dark pattern.\n"
        "Return ONLY a JSON array, one object per snippet: "
        '[{"id": "...", "patternId": "...|null", "confidence": 0.0-1.0, "reason": "<=15 words"}]\n\n'
        "Snippets:\n" + "\n".join(json.dumps(s.model_dump(), ensure_ascii=False) for s in snippets)
    )
    try:
        raw = await llm(prompt)
        data = json.loads(raw[raw.index("["): raw.rindex("]") + 1])
        return [d for d in data if d.get("patternId") in PATTERN_IDS + [None]]
    except Exception:
        return heuristic(snippets)


@app.post("/complaint")
async def complaint(req: ComplaintReq):
    names = sorted({f.get("patternName") or f.get("patternId") for f in req.findings})
    prompt = (
        "Write a formal consumer complaint (max 250 words, plain text, no markdown) to the National Consumer Helpline "
        "about dark patterns under the CCPA Guidelines for Prevention and Regulation of Dark Patterns, 2023. "
        "Be factual, cite each pattern type, the URL, amounts and evidence hashes. Ask for corrective action and refund.\n"
        f"Site: {req.site}\nURL: {req.url}\nPatterns: {', '.join(n for n in names if n)}\n"
        f"Findings: {json.dumps([{k: f.get(k) for k in ('label', 'reason', 'amount')} for f in req.findings][:10], ensure_ascii=False)}\n"
        f"Prices: {json.dumps(req.prices)}\nEvidence: {json.dumps(req.evidence[:5])}"
    )
    try:
        return {"text": (await llm(prompt, 600)).strip()}
    except Exception:
        return {"text": None}  # extension falls back to its template


@app.post("/tts")
async def tts(req: TTSReq):
    if not (ELEVEN_KEY and ELEVEN_VOICE):
        raise HTTPException(503, "ElevenLabs not configured")
    async with httpx.AsyncClient(timeout=30) as c:
        r = await c.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{ELEVEN_VOICE}",
            headers={"xi-api-key": ELEVEN_KEY, "Accept": "audio/mpeg"},
            json={"text": req.text[:800], "model_id": "eleven_multilingual_v2"},
        )
    if r.status_code != 200:
        raise HTTPException(502, "TTS failed")
    return Response(content=r.content, media_type="audio/mpeg")
