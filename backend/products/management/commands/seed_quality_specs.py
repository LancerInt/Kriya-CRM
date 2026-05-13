"""
Seed Product.quality_spec from the Product Range PDF.

Run once after migration:
    python manage.py seed_quality_specs

Components for each product:
    [{name, standard, acceptable_max, unit}, ...]

The COA editor:
  - Renders one row per component beneath the standard test parameters
  - Validates the entered Result against `acceptable_max`
  - Flags red + shows a popup with the acceptable range when exceeded
"""
from django.core.management.base import BaseCommand
from products.models import Product


SPECS = {
    # ── Botanical Pesticides ──
    "Ecoza Max":    [{"name": "Azadirachtin", "standard": 30000, "acceptable_max": 30100, "unit": "PPM"}],
    "Ecoza Ace":    [{"name": "Azadirachtin", "standard": 12000, "acceptable_max": 12600, "unit": "PPM"}],
    "Ecoza Pro":    [{"name": "Azadirachtin", "standard": 3000,  "acceptable_max": 3100,  "unit": "PPM"}],
    "Ecoza Rix":    [{"name": "Azadirachtin", "standard": 12000, "acceptable_max": 12200, "unit": "PPM"}],
    "MargoShine":   [{"name": "Neem oil", "standard": 70.0, "acceptable_max": 70.14, "unit": "%"}],
    "MargoRix":     [{"name": "Neem oil", "standard": 35.0, "acceptable_max": 35.20, "unit": "%"}],
    "K-Guard":      [{"name": "Karanjin", "standard": 20000, "acceptable_max": 20200, "unit": "PPM"}],
    "K-Rix":        [{"name": "Karanjin", "standard": 50000, "acceptable_max": 50100, "unit": "PPM"}],
    "Spindura Plus":[{"name": "Spinosad", "standard": 25.20, "acceptable_max": 25.25, "unit": "%"}],
    "Spindura Rix": [{"name": "Spinosad", "standard": 12.0,  "acceptable_max": 12.15, "unit": "%"}],
    "Spindura Pro": [{"name": "Spinosad", "standard": 2.50,  "acceptable_max": 2.60,  "unit": "%"}],
    "MargoSpin":    [
        {"name": "Neem oil", "standard": 70.0, "acceptable_max": 71.0,  "unit": "%"},
        {"name": "Spinosad", "standard": 1.2,  "acceptable_max": 1.25,  "unit": "%"},
    ],
    "WeedX":        [
        {"name": "Caprylic acid", "standard": 27.0, "acceptable_max": 27.01, "unit": "%"},
        {"name": "Capric acid",   "standard": 42.0, "acceptable_max": 42.03, "unit": "%"},
    ],
    "Admira Adyme": [{"name": "Thyme oil",    "standard": 2.0, "acceptable_max": 2.25, "unit": "%"}],
    "Admira Admon": [{"name": "Cinnamon oil", "standard": 2.0, "acceptable_max": 2.25, "unit": "%"}],
    "Admira Adrlic":[{"name": "Garlic oil",   "standard": 2.0, "acceptable_max": 2.25, "unit": "%"}],
    "Admira Adove": [{"name": "Clove oil",    "standard": 2.0, "acceptable_max": 2.25, "unit": "%"}],

    # ── Microbial Pesticides ── (validate the % component; CFU is informational)
    "Mycova":    [{"name": "Beauveria bassiana",            "standard": 1.15, "acceptable_max": 1.15, "unit": "% WP"}],
    "Rexora":    [{"name": "Metarhizium anisopliae",        "standard": 1.0,  "acceptable_max": 1.0,  "unit": "% WP"}],
    "Biota-V":   [{"name": "Trichoderma viride",            "standard": 1.15, "acceptable_max": 1.15, "unit": "% WP"}],
    "Biota-H":   [{"name": "Trichoderma harzianum",         "standard": 1.0,  "acceptable_max": 1.0,  "unit": "% WP"}],
    "Neurita":   [{"name": "Pseudomonas fluorescens",       "standard": 1.0,  "acceptable_max": 1.0,  "unit": "% WP"}],
    "Seira":     [{"name": "Verticillium lecanii",          "standard": 1.15, "acceptable_max": 1.15, "unit": "% WP"}],
    "EnCilo":    [{"name": "Verticillium chlamydosporium",  "standard": 1.0,  "acceptable_max": 1.0,  "unit": "% WP"}],
    "Subiliix":  [{"name": "Bacillus subtilis",             "standard": 1.5,  "acceptable_max": 1.5,  "unit": "% WP"}],
    "Subtilix":  [{"name": "Bacillus subtilis",             "standard": 1.5,  "acceptable_max": 1.5,  "unit": "% WP"}],
    "Elixora":   [{"name": "Bacillus amyloliquefaciens",    "standard": 10.0, "acceptable_max": 10.0, "unit": "% WP"}],

    # ── Bio Stimulants ──
    "Zenita":   [
        {"name": "Amino acids",     "standard": 30.0, "acceptable_max": 30.10, "unit": "%"},
        {"name": "Humic acid",      "standard": 25.0, "acceptable_max": 25.12, "unit": "%"},
        {"name": "Seaweed extract", "standard": 10.0, "acceptable_max": 10.12, "unit": "%"},
    ],
    "Cropsia":  [
        {"name": "Fulvic acid",             "standard": 5.0,  "acceptable_max": 5.12,  "unit": "%"},
        {"name": "Amino acids",             "standard": 10.0, "acceptable_max": 10.25, "unit": "%"},
        {"name": "Seaweed extract",         "standard": 5.0,  "acceptable_max": 5.11,  "unit": "%"},
        {"name": "Adhatoda vasica extract", "standard": 5.0,  "acceptable_max": 5.12,  "unit": "%"},
        {"name": "Moringa extract",         "standard": 3.0,  "acceptable_max": 3.10,  "unit": "%"},
    ],
    "Blooma":   [
        {"name": "Seaweed extract",          "standard": 25.0, "acceptable_max": 25.12, "unit": "%"},
        {"name": "Amino acid complex",       "standard": 20.0, "acceptable_max": 20.18, "unit": "%"},
        {"name": "Humic + Fulvic acid blend","standard": 25.0, "acceptable_max": 25.10, "unit": "%"},
    ],
    "EnRhize":  [
        {"name": "Vesicular Arbuscular Mycorrhizal spore", "standard": 10.0, "acceptable_max": 10.15, "unit": "%"},
    ],
    "Orgocare": [
        {"name": "Vegetable Fatty Acid Compounds", "standard": 20.0, "acceptable_max": 20.10, "unit": "%"},
        {"name": "Sesame Oil",                     "standard": 15.0, "acceptable_max": 15.12, "unit": "%"},
    ],
    "Envicta":  [
        {"name": "Humic Acid",      "standard": 25.0, "acceptable_max": 25.10, "unit": "%"},
        {"name": "Fulvic Acid",     "standard": 8.0,  "acceptable_max": 8.15,  "unit": "%"},
        {"name": "Amino Acid",      "standard": 22.0, "acceptable_max": 22.15, "unit": "%"},
        {"name": "Seaweed Extract", "standard": 10.0, "acceptable_max": 10.25, "unit": "%"},
    ],

    # ── Microbial Fertilizers ── (% w/ CFU is informational)
    "IGreen NPK":    [{"name": "Consortium of Bacteria", "standard": 12.0, "acceptable_max": 12.0, "unit": "% WP"}],
    "IGreen SHIELD": [{"name": "Consortium of Bacteria", "standard": 12.0, "acceptable_max": 12.0, "unit": "% WP"}],
    "IGreen N":      [{"name": "Bacterial strains",      "standard": 12.0, "acceptable_max": 12.0, "unit": "% WP"}],
    "IGreen P":      [{"name": "Bacterial strains",      "standard": 10.0, "acceptable_max": 10.0, "unit": "% WP"}],
    "IGreen K":      [{"name": "Bacterial strains",      "standard": 10.0, "acceptable_max": 10.0, "unit": "% WP"}],
    "IGreen Zn":     [{"name": "Bacterial strains",      "standard": 10.0, "acceptable_max": 10.0, "unit": "% WP"}],
    "IGreen S":      [{"name": "Bacterial strains",      "standard": 10.0, "acceptable_max": 10.0, "unit": "% WP"}],
    "IGreen Si":     [{"name": "Bacterial strains",      "standard": 10.0, "acceptable_max": 10.0, "unit": "% WP"}],
    # Substrates (Mystica, Engrow, Maxineem, K-Mix) — no spec in PDF, skip
}


class Command(BaseCommand):
    help = "Seed Product.quality_spec from the Product Range PDF."

    def handle(self, *args, **opts):
        updated = 0
        skipped = []
        for name, components in SPECS.items():
            qs = Product.objects.filter(name__iexact=name)
            if not qs.exists():
                skipped.append(name)
                continue
            p = qs.first()
            p.quality_spec = {"components": components}
            p.save(update_fields=["quality_spec"])
            updated += 1
            self.stdout.write(self.style.SUCCESS(f"OK  {name}: {len(components)} component(s)"))

        self.stdout.write("")
        self.stdout.write(self.style.SUCCESS(f"Updated: {updated}"))
        if skipped:
            self.stdout.write(self.style.WARNING(f"Skipped (no matching Product): {', '.join(skipped)}"))
