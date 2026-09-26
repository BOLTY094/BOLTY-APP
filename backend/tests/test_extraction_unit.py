"""Unit tests for backend.extraction._verify and pdf_text (no LLM calls)."""
import os
import sys

import pytest

sys.path.insert(0, "/app/backend")
import extraction  # noqa: E402


SAMPLE_TEXT = (
    "Bolletta Energia Elettrica\n"
    "Intestatario: VERBA GROUP SRLS\n"
    "Codice Fiscale: 04137230928\n"
    "Partita Iva: 04137230928\n"
    "Fornitore: Duferco Energia SpA\n"
    "Sede legale — Genova — P.IVA 01016870329 — Registro Imprese\n"
)


class TestVerify:
    def test_keeps_values_present_verbatim(self):
        cand = {
            "fornitore": "Duferco Energia SpA",
            "intestatario": "VERBA GROUP SRLS",
            "tipo_intestatario": "azienda",
            "codice_fiscale": "04137230928",
            "partita_iva": "04137230928",
        }
        out = extraction._verify(cand, SAMPLE_TEXT)
        assert out["fornitore"] == "Duferco Energia SpA"
        assert out["intestatario"] == "VERBA GROUP SRLS"
        assert out["tipo_intestatario"] == "azienda"
        assert out["codice_fiscale"] == "04137230928"
        assert out["partita_iva"] == "04137230928"

    def test_pdivas_even_footer_ones_are_kept_if_literally_present(self):
        # 01016870329 is present in text (footer), so verify keeps it (fine).
        cand = {"partita_iva": "01016870329"}
        out = extraction._verify(cand, SAMPLE_TEXT)
        assert out["partita_iva"] == "01016870329"

    def test_hallucinated_fornitore_becomes_none(self):
        cand = {"fornitore": "Enel Energia"}
        out = extraction._verify(cand, SAMPLE_TEXT)
        assert out["fornitore"] is None

    def test_hallucinated_cf_becomes_none(self):
        cand = {"codice_fiscale": "RSSMRA80A01H501U"}
        out = extraction._verify(cand, SAMPLE_TEXT)
        assert out["codice_fiscale"] is None

    def test_malformed_codes_become_none(self):
        cand = {"codice_fiscale": "abc", "partita_iva": "123"}
        out = extraction._verify(cand, SAMPLE_TEXT)
        assert out["codice_fiscale"] is None
        assert out["partita_iva"] is None

    def test_tipo_inferred_azienda_from_11_digit_cf(self):
        cand = {"codice_fiscale": "04137230928"}  # 11-digit
        out = extraction._verify(cand, SAMPLE_TEXT)
        assert out["tipo_intestatario"] == "azienda"

    def test_tipo_inferred_persona_from_16_char_cf(self):
        text = "Intestatario Mario Rossi — Codice Fiscale RSSMRA80A01H501U"
        cand = {"codice_fiscale": "RSSMRA80A01H501U"}
        out = extraction._verify(cand, text)
        assert out["codice_fiscale"] == "RSSMRA80A01H501U"
        assert out["tipo_intestatario"] == "persona"

    def test_no_text_layer_keeps_wellformed_values(self):
        # vision path: text is None -> presence check is skipped, only formats validated
        cand = {
            "fornitore": "Enel Energia",
            "codice_fiscale": "RSSMRA80A01H501U",
            "partita_iva": "01016870329",
        }
        out = extraction._verify(cand, None)
        assert out["fornitore"] == "Enel Energia"
        assert out["codice_fiscale"] == "RSSMRA80A01H501U"
        assert out["partita_iva"] == "01016870329"


@pytest.mark.skipif(not os.path.exists("/tmp/duferco.pdf"), reason="duferco.pdf not present")
class TestPdfText:
    def test_pdf_text_contains_supplier_name(self):
        with open("/tmp/duferco.pdf", "rb") as f:
            data = f.read()
        text = extraction.pdf_text(data)
        assert "Duferco Energia SpA" in text
