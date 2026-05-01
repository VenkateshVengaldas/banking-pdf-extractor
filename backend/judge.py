import json
import re

from pdf_processor import load_pil_images


JUDGE_PROMPT = """You are a senior banking auditor and document verification expert. Your role is to independently evaluate the accuracy of an automated field extraction from a financial document.

You will receive:
1. The original banking/financial document (text or images)
2. The set of fields that were automatically extracted

Your job:
- Independently read the document and verify each extracted field
- Score each field and explain any discrepancies
- Provide a final overall accuracy score

Scoring status for each field:
- "correct": Value accurately matches the document content
- "incorrect": Value is wrong or significantly differs from the document
- "missing": Field is null/empty but the information IS present in the document
- "acceptable": Field is null and the information is genuinely absent from the document
- "partial": Field has some correct info but is incomplete or slightly inaccurate

Return ONLY a valid JSON object with this exact structure (no markdown, no explanation):
{
  "overall_accuracy": <integer 0-100>,
  "field_scores": {
    "<field_name>": {
      "status": "correct|incorrect|missing|acceptable|partial",
      "extracted_value": <the value that was extracted, or null>,
      "correct_value": <what the correct value should be, or null if unverifiable>,
      "comment": "<brief explanation of your assessment>"
    }
  },
  "overall_feedback": "<2-3 sentence summary of extraction quality and main issues>",
  "improvement_suggestions": [
    "<specific, actionable suggestion for improving the extraction prompt>"
  ]
}

Accuracy calculation guidance:
- Start at 100 and subtract: 10 per "incorrect", 8 per "missing", 3 per "partial"
- "correct" and "acceptable" fields do not deduct points
- Apply judgment — critical fields (loan_amount, beneficiary_name) are more important
"""


def _parse_json_response(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1] if len(parts) > 1 else text
        if text.startswith("json"):
            text = text[4:]
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if match:
            return json.loads(match.group())
        return {
            "overall_accuracy": 0,
            "field_scores": {},
            "overall_feedback": f"Judge failed to produce parseable JSON. Raw: {text[:200]}",
            "improvement_suggestions": [],
        }


def judge_extraction(client, model_name: str, pdf_data: dict, extracted: dict) -> dict:
    extracted_json = json.dumps(extracted, indent=2)
    use_vision = pdf_data["is_scanned"] or len(pdf_data["text"].strip()) < 500

    if use_vision:
        images = load_pil_images(pdf_data)
        parts: list = [JUDGE_PROMPT + f"\n\nExtracted fields to verify:\n{extracted_json}\n\nDocument pages:"]
        parts.extend(images)
        response = client.models.generate_content(model=model_name, contents=parts)
    else:
        prompt = (
            f"{JUDGE_PROMPT}\n\nDocument content:\n{pdf_data['text']}"
            f"\n\nExtracted fields to verify:\n{extracted_json}"
        )
        response = client.models.generate_content(model=model_name, contents=prompt)

    return _parse_json_response(response.text)
