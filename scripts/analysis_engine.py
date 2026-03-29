import json
import logging
import os
import re
from collections import Counter
from typing import Any, Dict, List

import requests

from scripts.db_manager import db
from scripts.model_runtime import runtime_manager
from scripts.vectorize import get_embedding

logger = logging.getLogger(__name__)

SUPPORTED_ANALYSIS_MODES = {
    "cross_pollination": "Cross-Pollination",
    "friction": "Friction Analysis",
    "gap": "Gap Analysis",
    "rag": "Prompted RAG",
}

STOP_WORDS = {
    "the",
    "and",
    "that",
    "with",
    "from",
    "this",
    "into",
    "their",
    "there",
    "have",
    "what",
    "when",
    "where",
    "which",
    "while",
    "about",
    "because",
    "through",
    "would",
    "could",
    "should",
    "your",
    "than",
    "them",
    "they",
    "then",
    "been",
    "were",
    "will",
    "also",
    "each",
    "using",
    "used",
    "into",
    "over",
    "more",
    "most",
    "some",
    "very",
    "only",
    "just",
    "such",
    "like",
    "across",
    "between",
    "within",
    "inside",
    "outside",
    "under",
    "after",
    "before",
    "than",
    "than",
    "text",
    "echo",
    "analysis",
    "context",
}


def _normalize_mode(mode: str) -> str:
    normalized = str(mode or "").strip().lower().replace("-", "_").replace(" ", "_")
    if normalized not in SUPPORTED_ANALYSIS_MODES:
        raise ValueError(f"Unsupported analysis mode '{mode}'.")
    return normalized


def _trim(text: str, limit: int = 420) -> str:
    value = str(text or "").strip()
    if len(value) <= limit:
        return value
    return f"{value[: limit - 3].rstrip()}..."


def _normalize_contexts(contexts: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    normalized = []
    seen = set()
    for index, item in enumerate(contexts or []):
        text = str(item.get("text") or "").strip()
        if not text:
            continue
        context_id = str(item.get("context_id") or f"context-{index}")
        if context_id in seen:
            continue
        seen.add(context_id)
        normalized.append(
            {
                "context_id": context_id,
                "kind": str(item.get("kind") or "context"),
                "anchor_id": str(item.get("anchor_id") or ""),
                "title": str(item.get("title") or "Selected Context"),
                "text": text,
                "chapter": str(item.get("chapter") or ""),
                "source_label": str(item.get("source_label") or ""),
                "echo_id": str(item.get("echo_id") or ""),
                "cluster_id": str(item.get("cluster_id") or ""),
                "book_id": str(item.get("book_id") or ""),
                "library_id": str(item.get("library_id") or ""),
            }
        )
    return normalized


def _normalize_selection_refs(selection_refs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    normalized = []
    seen = set()
    for item in selection_refs or []:
        ref_id = str(item.get("id") or "")
        kind = str(item.get("kind") or "selection")
        key = f"{kind}:{ref_id}"
        if key in seen:
            continue
        seen.add(key)
        normalized.append(
            {
                "kind": kind,
                "id": ref_id,
                "label": str(item.get("label") or ""),
                "cluster_id": str(item.get("cluster_id") or ""),
                "echo_id": str(item.get("echo_id") or ""),
            }
        )
    return normalized


def _extract_keywords(text: str, limit: int = 6) -> List[str]:
    words = re.findall(r"[A-Za-z][A-Za-z\\-]{3,}", str(text or "").lower())
    ranked = Counter(word for word in words if word not in STOP_WORDS)
    return [word for word, _ in ranked.most_common(limit)]


def _build_query_text(mode: str, prompt: str, contexts: List[Dict[str, Any]]) -> str:
    context_titles = [ctx["title"] for ctx in contexts[:4] if ctx.get("title")]
    text_samples = [_trim(ctx["text"], 180) for ctx in contexts[:4]]
    header = SUPPORTED_ANALYSIS_MODES.get(mode, "Analysis")
    prompt_text = str(prompt or "").strip()
    if prompt_text:
        return "\n".join([header, prompt_text, *context_titles, *text_samples]).strip()
    return "\n".join([header, *context_titles, *text_samples]).strip()


def _format_local_evidence(results: List[Dict[str, Any]], source_kind: str) -> List[Dict[str, Any]]:
    formatted = []
    seen = set()
    for row in results or []:
        evidence_id = f"{row.get('filename','')}::{row.get('chunk_id','')}::{row.get('chunk_ref','')}"
        if evidence_id in seen:
            continue
        seen.add(evidence_id)
        similarity = int((1 / (1 + float(row.get("_distance", 0.5)))) * 100)
        formatted.append(
            {
                "id": evidence_id,
                "source_kind": source_kind,
                "title": str(row.get("title") or row.get("filename") or "Untitled"),
                "author": str(row.get("author") or "Unknown"),
                "year": str(row.get("year") or ""),
                "filename": str(row.get("filename") or ""),
                "source_lid": str(row.get("book_id") or ""),
                "chapter": str(row.get("chapter") or "Unknown Chapter"),
                "text": _trim(str(row.get("text") or ""), 420),
                "similarity": similarity,
                "url": "",
            }
        )
    return formatted


class BaseWebEvidenceProvider:
    def is_configured(self) -> bool:
        return False

    def search(self, query: str, limit: int = 5) -> Dict[str, Any]:
        return {"status": "disabled", "results": []}


class DisabledWebEvidenceProvider(BaseWebEvidenceProvider):
    pass


class GenericJsonWebEvidenceProvider(BaseWebEvidenceProvider):
    def __init__(self):
        self.endpoint = os.getenv("COGNITIVE_WEB_RAG_ENDPOINT", "").strip()
        self.api_key = os.getenv("COGNITIVE_WEB_RAG_API_KEY", "").strip()
        self.timeout_seconds = int(os.getenv("COGNITIVE_WEB_RAG_TIMEOUT_SECONDS", "15"))

    def is_configured(self) -> bool:
        return bool(self.endpoint)

    def search(self, query: str, limit: int = 5) -> Dict[str, Any]:
        if not self.is_configured():
            return {"status": "disabled", "results": []}

        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"

        response = requests.post(
            self.endpoint,
            json={"query": query, "limit": limit},
            headers=headers,
            timeout=self.timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json() or {}
        raw_results = payload.get("results") if isinstance(payload, dict) else payload
        if not isinstance(raw_results, list):
            raw_results = []

        normalized = []
        for index, item in enumerate(raw_results[:limit]):
            normalized.append(
                {
                    "id": str(item.get("id") or f"web-{index}"),
                    "source_kind": "web",
                    "title": str(item.get("title") or item.get("source") or "Web Result"),
                    "author": str(item.get("author") or item.get("source") or "Web"),
                    "year": str(item.get("year") or ""),
                    "filename": "",
                    "source_lid": "",
                    "chapter": str(item.get("section") or ""),
                    "text": _trim(str(item.get("snippet") or item.get("text") or ""), 420),
                    "similarity": int(item.get("score") or 0),
                    "url": str(item.get("url") or ""),
                }
            )

        return {"status": "success", "results": normalized}


def _get_web_provider() -> BaseWebEvidenceProvider:
    provider = os.getenv("COGNITIVE_WEB_RAG_PROVIDER", "disabled").strip().lower()
    if provider == "generic_json":
        return GenericJsonWebEvidenceProvider()
    return DisabledWebEvidenceProvider()


def _search_local_evidence(query_text: str) -> List[Dict[str, Any]]:
    try:
        query_vec = get_embedding(query_text)
    except Exception as error:
        logger.error(f"Embedding failed for derived analysis: {error}")
        return []

    local_results = _format_local_evidence(
        db.search(query_vec, limit=10, table_name="thoughts"),
        "local",
    )
    registry_results = _format_local_evidence(
        db.search(query_vec, limit=4, table_name="registry_vectors"),
        "registry",
    )
    combined = []
    seen = set()
    for item in [*local_results, *registry_results]:
        if item["id"] in seen:
            continue
        seen.add(item["id"])
        combined.append(item)
    return combined[:10]


def _heuristic_payload(
    mode: str,
    prompt: str,
    contexts: List[Dict[str, Any]],
    local_evidence: List[Dict[str, Any]],
    web_evidence: List[Dict[str, Any]],
) -> Dict[str, Any]:
    context_blob = " ".join(ctx["text"] for ctx in contexts[:4])
    evidence_blob = " ".join(item["text"] for item in local_evidence[:4])
    top_terms = _extract_keywords(f"{context_blob} {evidence_blob}", limit=5)
    context_titles = ", ".join(ctx["title"] for ctx in contexts[:3] if ctx.get("title"))
    answer_seed = prompt.strip() or SUPPORTED_ANALYSIS_MODES.get(mode, "Analysis")

    if mode == "cross_pollination":
        summary = (
            f"{answer_seed} surfaces shared territory around {', '.join(top_terms[:3]) or 'the selected ideas'}. "
            f"The strongest bridges appear between {context_titles or 'the selected contexts'} and the retrieved evidence."
        )
        bullets = [
            f"Bridge concepts: {', '.join(top_terms[:4]) or 'No stable bridge terms detected'}",
            f"Primary evidence count: {len(local_evidence)} local source(s)",
            "Use this column to continue branching from the most productive bridge.",
        ]
    elif mode == "friction":
        summary = (
            f"{answer_seed} highlights the strongest tension lines around {', '.join(top_terms[:3]) or 'the selected contexts'}. "
            "The retrieved evidence suggests where assumptions diverge or conflict."
        )
        bullets = [
            f"Friction themes: {', '.join(top_terms[:4]) or 'No obvious friction cues detected'}",
            "Look for claims that use the same terms but push different conclusions.",
            "Follow up by expanding the evidence around the most oppositional pair.",
        ]
    elif mode == "gap":
        summary = (
            f"{answer_seed} points to missing or weakly supported areas around {', '.join(top_terms[:3]) or 'the current selection'}. "
            "The current context is stronger on what is present than on what is absent."
        )
        bullets = [
            f"Blindspot cues: {', '.join(top_terms[:4]) or 'No stable blindspot cues detected'}",
            "Search for external frames, counterexamples, or periods not represented here.",
            "Use the suggested follow-ups to branch into the weakest part of the evidence base.",
        ]
    else:
        summary = (
            f"{answer_seed} was answered using {len(contexts)} selected context item(s), "
            f"{len(local_evidence)} local evidence item(s), and {len(web_evidence)} web evidence item(s). "
            f"The most recurrent terms were {', '.join(top_terms[:3]) or 'not strongly clustered'}."
        )
        bullets = [
            "This answer is grounded first in the selected context and then expanded through retrieval.",
            "Inspect the evidence sections below before saving the result into the echo tree.",
            "Refine the question if you want a narrower answer or different evidence balance.",
        ]

    follow_ups = [f"Expand on {term}" for term in top_terms[:3]]

    return {
        "title": f"{SUPPORTED_ANALYSIS_MODES.get(mode, 'Analysis')} Result",
        "summary": summary,
        "bullets": bullets,
        "follow_ups": follow_ups,
    }


def _build_llm_prompt(
    mode: str,
    prompt: str,
    contexts: List[Dict[str, Any]],
    local_evidence: List[Dict[str, Any]],
    web_evidence: List[Dict[str, Any]],
) -> str:
    contexts_text = "\n".join(
        [
            f"[Context {index + 1}] {ctx['title']} | {ctx.get('chapter') or ctx.get('source_label')}\n{_trim(ctx['text'], 500)}"
            for index, ctx in enumerate(contexts[:6])
        ]
    )
    local_text = "\n".join(
        [
            f"[Local {index + 1}] {item['title']} | {item.get('chapter')}\n{_trim(item['text'], 320)}"
            for index, item in enumerate(local_evidence[:6])
        ]
    )
    web_text = "\n".join(
        [
            f"[Web {index + 1}] {item['title']} | {item.get('url')}\n{_trim(item['text'], 240)}"
            for index, item in enumerate(web_evidence[:4])
        ]
    )
    mode_label = SUPPORTED_ANALYSIS_MODES.get(mode, "Analysis")
    return f"""You are synthesizing a derived analysis column for a research canvas.
Mode: {mode_label}
User prompt: {prompt or "No explicit user prompt was provided."}

Selected context:
{contexts_text or "No explicit context provided."}

Local evidence:
{local_text or "No local evidence available."}

Web evidence:
{web_text or "No web evidence available."}

Respond only as valid JSON with this shape:
{{
  "title": "short column title",
  "summary": "2-4 sentence synthesis grounded in the evidence",
  "bullets": ["short point", "short point"],
  "follow_ups": ["short follow-up", "short follow-up"]
}}
"""


def run_analysis(
    mode: str,
    prompt: str = "",
    contexts: List[Dict[str, Any]] | None = None,
    selection_refs: List[Dict[str, Any]] | None = None,
    include_web: bool = True,
    title_hint: str = "",
) -> Dict[str, Any]:
    normalized_mode = _normalize_mode(mode)
    normalized_contexts = _normalize_contexts(contexts or [])
    normalized_selection_refs = _normalize_selection_refs(selection_refs or [])

    if not normalized_contexts:
        raise ValueError("At least one context item is required to run an analysis.")

    query_text = _build_query_text(normalized_mode, prompt, normalized_contexts)
    local_evidence = _search_local_evidence(query_text)

    web_provider = _get_web_provider()
    web_status = "disabled"
    web_message = "Web retrieval is not configured."
    web_evidence: List[Dict[str, Any]] = []

    if include_web:
        if web_provider.is_configured():
            try:
                provider_result = web_provider.search(query_text, limit=5)
                web_status = provider_result.get("status") or "success"
                web_evidence = provider_result.get("results") or []
                web_message = (
                    "Live web evidence was included."
                    if web_evidence
                    else "The provider returned no web evidence."
                )
            except Exception as error:
                logger.error(f"Web evidence search failed: {error}")
                web_status = "error"
                web_message = "Live web retrieval failed for this request."
        else:
            web_status = "disabled"
            web_message = "Live web retrieval is available only after provider keys are configured."
    else:
        web_status = "skipped"
        web_message = "Web retrieval was skipped for this request."

    fallback_payload = _heuristic_payload(
        normalized_mode,
        prompt,
        normalized_contexts,
        local_evidence,
        web_evidence,
    )
    synthesized = runtime_manager.generate_structured_json(
        _build_llm_prompt(
            normalized_mode,
            prompt,
            normalized_contexts,
            local_evidence,
            web_evidence,
        ),
        fallback=fallback_payload,
        timeout=90,
        temperature=0.2,
        num_predict=700,
    )

    title = str(synthesized.get("title") or "").strip() or (
        title_hint.strip() if title_hint else fallback_payload["title"]
    )
    summary = str(synthesized.get("summary") or "").strip() or fallback_payload["summary"]

    bullets = [
        str(item).strip()
        for item in (synthesized.get("bullets") or fallback_payload["bullets"] or [])
        if str(item).strip()
    ][:5]
    follow_ups = [
        str(item).strip()
        for item in (
            synthesized.get("follow_ups")
            or fallback_payload["follow_ups"]
            or []
        )
        if str(item).strip()
    ][:4]

    return {
        "mode": normalized_mode,
        "mode_label": SUPPORTED_ANALYSIS_MODES[normalized_mode],
        "title": title,
        "summary": summary,
        "bullets": bullets,
        "follow_ups": follow_ups,
        "contexts": [
            {
                **ctx,
                "text": _trim(ctx["text"], 360),
            }
            for ctx in normalized_contexts
        ],
        "selection_refs": normalized_selection_refs,
        "local_evidence": local_evidence,
        "web_evidence": web_evidence,
        "web_status": web_status,
        "web_message": web_message,
        "prompt": prompt,
        "title_hint": title_hint,
        "include_web": bool(include_web),
    }
