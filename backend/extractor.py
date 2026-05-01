import json
import re
from typing import Optional

import PIL.Image
from pdf_processor import load_pil_images

EXTRACTION_FIELDS = {
    "loan_amount": "The principal loan or credit amount (include currency symbol/code)",
    "beneficiary_name": "Full name of the loan beneficiary or primary borrower",
    "account_number": "Bank account or loan account number",
    "bank_name": "Name of the issuing or financing bank/financial institution",
    "document_date": "Date of the document (preserve original format)",
    "reference_number": "Document reference, case number, or memo ID",
    "interest_rate": "Interest rate as stated (e.g., '6.5% per annum')",
    "loan_type": "Type of loan or credit facility (e.g., term loan, revolving credit)",
    "maturity_date": "Loan maturity, expiry, or repayment date",
    "credit_limit": "Credit limit or maximum facility amount if different from disbursed amount",
    "currency": "Currency code or symbol (e.g., USD, EUR, GBP)",
    "purpose": "Stated purpose or use of the loan proceeds",
    "guarantor_name": "Name of guarantor, co-borrower, or surety if present",
    "collateral": "Description of collateral, security, or pledge",
}

DEFAULT_EXTRACTION_PROMPT = """You are an expert financial document analyst specializing in banking instruments such as credit memos, loan agreements, facility letters, and bank guarantees.

Your task is to extract key financial information from the provided banking document with high precision.

Extract the following fields:
{fields_description}

Extraction rules:
- Extract values EXACTLY as they appear in the document — do not paraphrase or normalize unless necessary
- For monetary amounts, always include the currency symbol or code if visible (e.g., "USD 1,500,000.00" not just "1500000")
- For dates, preserve the original format shown in the document
- For names, include full legal names as written
- If a field is genuinely absent from the document, set its value to null
- Never guess or hallucinate values — only extract what is explicitly stated
- Account numbers and reference numbers must be reproduced character-for-character
- Look for information in headers, footers, tables, and body text

Return ONLY a valid JSON object with the exact field names listed above as keys. No markdown, no explanation, no preamble — just the JSON.

Example format:
{{
  "loan_amount": "USD 2,500,000.00",
  "beneficiary_name": "Acme Corporation Ltd",
  "account_number": "001-234567-8",
  "bank_name": "First National Bank",
  "document_date": "15 March 2024",
  "reference_number": "CM-2024-00892",
  "interest_rate": "7.25% per annum",
  "loan_type": "Term Loan",
  "maturity_date": "15 March 2027",
  "credit_limit": null,
  "currency": "USD",
  "purpose": "Working capital financing",
  "guarantor_name": "John A. Smith",
  "collateral": "Commercial property at 123 Main St, valued at USD 4,000,000"
}}
"""


def _fields_description() -> str:
    return "\n".join(f"- {k}: {v}" for k, v in EXTRACTION_FIELDS.items())


def build_extraction_prompt(custom_prompt: Optional[str] = None) -> str:
    if custom_prompt and custom_prompt.strip():
        return custom_prompt
    return DEFAULT_EXTRACTION_PROMPT.format(fields_description=_fields_description())


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
        raise ValueError(f"Could not parse JSON: {text[:300]}")


def extract_fields(client, model_name: str, pdf_data: dict, prompt: str) -> dict:
    from google.genai import types

    use_vision = pdf_data["is_scanned"] or len(pdf_data["text"].strip()) < 500

    if use_vision:
        pil_images = load_pil_images(pdf_data)
        parts: list = [prompt + "\n\nExtract information from the document pages below:"]
        parts.extend(pil_images)
        response = client.models.generate_content(model=model_name, contents=parts)
    else:
        full_prompt = prompt + f"\n\nDocument content:\n{pdf_data['text']}"
        response = client.models.generate_content(model=model_name, contents=full_prompt)

    return _parse_json_response(response.text)
