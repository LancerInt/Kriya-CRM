"""
Commercial Invoice Service — auto-fill from client/order, PDF generation, email sending.
Matches the Kriya Biosys Commercial Invoice template layout with:
- Exporter / Consignee / Notify Party
- Shipment & Loading details
- Packing details table
- Dual currency totals (USD + INR)
- IGST calculation
- Grand Total
- Bank Details + Seal/Sign
"""
import io
import logging
from datetime import date
from decimal import Decimal

logger = logging.getLogger(__name__)

# ── Company Constants (Exporter) ──
EXPORTER = {
    'name': 'KRIYA BIOSYS PRIVATE LIMITED',
    'address': 'D.no : 233, Aarthi Nagar,\nMohan Nagar, Narasothipatti,\nSalem - 636004, Tamilnadu',
    'gstin': '33AAHCK9695F1Z3',
    'email': 'info@kriya.ltd',
    'iec': 'AAHCK9695F',
}

DEFAULT_BANK = (
    'Bank name: ICICI Bank Ltd\n'
    'Branch name: Salem Main Branch\n'
    'Beneficiary: Kriya Biosys Private Limited\n'
    'IFSC Code: ICIC0006119\n'
    'Swift Code: ICICINBB'
)


def create_ci_from_order(order, user):
    """Create a CommercialInvoice from an Order, auto-filling client data."""
    from finance.models import CommercialInvoice, CommercialInvoiceItem

    client = order.client

    # Generate invoice number
    count = CommercialInvoice.objects.count() + 1
    today = date.today()
    invoice_number = f'{today.strftime("%y-%m")}/KBC-{count:03d}'

    ci = CommercialInvoice.objects.create(
        order=order,
        client=client,
        invoice_number=invoice_number,
        invoice_date=today,
        created_by=user,

        exporter_ref=f'IEC: {EXPORTER["iec"]}',

        # Client / Consignee
        client_company_name=client.company_name,
        client_tax_number=client.tax_number or '',
        client_address=client.address or '',
        client_pincode=client.postal_code or '',
        client_city_state_country=f'{client.city}, {client.state}, {client.country}'.strip(', '),
        client_phone=client.phone_number or '',

        # Notify party defaults to same as consignee
        notify_company_name=client.company_name,
        notify_address=client.address or '',
        notify_phone=client.phone_number or '',

        # Buyer
        buyer_order_no=order.po_number or '',
        buyer_order_date=order.po_received_date,

        # Shipment details
        country_of_origin='India',
        country_of_final_destination=client.country or '',
        terms_of_delivery=f'{order.delivery_terms} - Chennai / Tuticorin Port' if order.delivery_terms else '',
        terms_of_trade=order.payment_terms or '',
        payment_terms=order.payment_terms or '',

        # Totals
        currency=order.currency,
        total_fob_usd=order.total,
        total_invoice_usd=order.total,
        amount_in_words=_number_to_words(float(order.total), order.currency),

        bank_details=DEFAULT_BANK,
    )

    # Copy items from order
    # CI: product_name = client brand name from Product master
    #     description_of_goods = company product name from Product master
    for item in order.items.all():
        ci_product_name = item.client_product_name or item.product_name
        ci_description = item.product_name

        # If product FK exists, pull client_brand_names from Product master
        if item.product and item.product.client_brand_names:
            brand_names = [b.strip() for b in item.product.client_brand_names.split(',') if b.strip()]
            if brand_names:
                ci_product_name = brand_names[0]
            ci_description = str(item.product)

        CommercialInvoiceItem.objects.create(
            ci=ci,
            product_name=ci_product_name,
            client_product_name=item.client_product_name,
            hsn_code='',
            packages_description=f'{int(item.quantity)} {item.unit} Container Packing',
            description_of_goods=ci_description,
            quantity=item.quantity,
            unit=item.unit,
            unit_price=item.unit_price,
            total_price=item.total_price,
        )

    return ci


def generate_ci_pdf(ci, template='normal'):
    """Generate PDF matching the Kriya Biosys Commercial Invoice template.

    template:
      'normal' — Exporter + Consignee top row only. No Notify section.
      'notify' — Exporter + Consignee top row, Notify full-width row below.
      'buyer'  — Exporter | Buyer (top row), Notify | Consignee (bottom row).
                 Buyer details come from the existing notify_* fields.
                 (You can rename / add dedicated buyer fields later.)
    """
    import os
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image, Flowable
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from django.conf import settings

    buffer = io.BytesIO()
    pdf_title = f'CI {ci.invoice_number} - {ci.client_company_name}'
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=8*mm, bottomMargin=8*mm,
                            leftMargin=7*mm, rightMargin=7*mm,
                            title=pdf_title, author='Kriya Biosys Private Limited')
    styles = getSampleStyleSheet()
    el = []

    G = colors.HexColor('#548b2e')   # Kriya green
    GR = colors.HexColor('#cccccc')  # grid grey
    W = colors.white
    B = colors.black
    NAVY = colors.HexColor('#1a3a5c')

    img_dir = os.path.join(settings.BASE_DIR, 'static', 'images')
    logo_path = os.path.join(img_dir, 'logo.png')
    seal_path = os.path.join(img_dir, 'seal.png')
    sign_path = os.path.join(img_dir, 'sign.png')

    # ── Rotated sidebar helper ──
    class RotatedText(Flowable):
        def __init__(self, text, w, h, bg, fs=7, font='Helvetica-Bold'):
            Flowable.__init__(self)
            self.text = text; self.width = w; self.height = h; self.bg = bg; self.fs = fs; self.font = font
        def draw(self):
            c = self.canv; c.saveState()
            c.setFillColor(self.bg); c.rect(0, 0, self.width, self.height, fill=1, stroke=0)
            c.setFillColor(W); c.setFont(self.font, self.fs)
            c.translate(self.width/2, self.height/2); c.rotate(90)
            c.drawCentredString(0, -self.fs/3, self.text); c.restoreState()

    PW = 196*mm  # page width (A4 210mm - 7mm side margins × 2)

    # Register fonts
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    _bf = 'Helvetica-Bold'
    _br = 'Helvetica'
    _mt = 'Helvetica'
    try:
        bos_bold = os.path.join(img_dir, 'BookmanOldStyle-Bold.ttf')
        bos_reg = os.path.join(img_dir, 'BookmanOldStyle-Regular.ttf')
        mont_reg = os.path.join(img_dir, 'Montserrat-Regular.ttf')
        if os.path.exists(bos_bold):
            pdfmetrics.registerFont(TTFont('BookmanOldStyle-Bold', bos_bold))
            _bf = 'BookmanOldStyle-Bold'
        if os.path.exists(bos_reg):
            pdfmetrics.registerFont(TTFont('BookmanOldStyle', bos_reg))
            _br = 'BookmanOldStyle'
        if os.path.exists(mont_reg):
            pdfmetrics.registerFont(TTFont('Montserrat-Regular', mont_reg))
            _mt = 'Montserrat-Regular'
    except Exception:
        pass

    # ── Style sizes — tuned to fit one A4 page comfortably ──
    body  = ParagraphStyle('body',  parent=styles['Normal'], fontSize=8,    leading=10, fontName=_br)
    bodyb = ParagraphStyle('bodyb', parent=styles['Normal'], fontSize=8,    leading=10, fontName=_bf)
    head  = ParagraphStyle('head',  parent=styles['Normal'], fontSize=10,   leading=12, fontName=_bf)
    metaL = ParagraphStyle('metaL', parent=styles['Normal'], fontSize=8.5,  leading=10, fontName=_bf, alignment=1)  # bold black on gray strip
    metaV = ParagraphStyle('metaV', parent=styles['Normal'], fontSize=8.5,  leading=10, fontName=_br, alignment=1)
    lb    = ParagraphStyle('lb',    parent=styles['Normal'], fontSize=8,    leading=10, fontName=_bf, textColor=NAVY)
    vl    = ParagraphStyle('vl',    parent=styles['Normal'], fontSize=8,    leading=10, fontName=_br)
    bkH   = ParagraphStyle('bkH',   parent=styles['Normal'], fontSize=10,   leading=12, fontName=_bf)
    bkL   = ParagraphStyle('bkL',   parent=styles['Normal'], fontSize=7,    leading=9,  fontName=_bf)
    bkV   = ParagraphStyle('bkV',   parent=styles['Normal'], fontSize=7,    leading=9,  fontName=_br)
    # Aliases so any other downstream code keeps working.
    s8  = body
    s7  = body
    s8b = bodyb

    # ═══ ROW 1: Logo + INVOICE title (DistinctStyleSans-Light) ═══
    # Use RW=50mm — same width as the Invoice Number / Date panel below
    logo = Image(logo_path, width=44*mm, height=25*mm, hAlign='LEFT') if os.path.exists(logo_path) else ''
    # Reducing Consignee column width shrinks the gray strip horizontally.
    # The freed-up space goes into GAP (white), so total page width and the
    # right meta panel position both stay the same.
    RW = 50*mm
    GAP = 23*mm   # was 3mm
    EW = 60*mm
    CW2 = PW - EW - GAP - RW   # = 73mm (was 83mm) — 10mm shorter strip
    title_p = Paragraph('INVOICE', ParagraphStyle('ti', fontSize=20, textColor=W, fontName=_mt, alignment=1, leading=24))
    title_box = Table([[title_p]], colWidths=[RW], rowHeights=[25*mm])
    title_box.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), G),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),   # vertical centre
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
    ]))
    # Use same 4-column layout as exporter row: EW | CW2 | GAP | RW
    h0 = Table([[logo, '', '', title_box]], colWidths=[EW, CW2, GAP, RW])
    h0.setStyle(TableStyle([
        # Zero-pad every cell so the logo cell's default 6pt padding doesn't
        # inflate the row height past 25mm. Without this the row stretches
        # to ~29mm and a white gap appears below the green INVOICE box.
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('SPAN', (0,0), (1,0)),
    ]))
    el.append(h0)
    # No spacer — green INVOICE box must touch the gray Invoice Number strip
    # below it. Same applies to padding inside the rc table (handled below).

    # ═══ ROW 2: Exporter | Consignee + Notify | Invoice No + Date ═══
    MDG = colors.HexColor('#d5d5d5')
    VLG = colors.HexColor('#f0f0f0')

    # Right column: Invoice Number / value / Date / value (alternating green-strip & white)
    right_rows = [
        [Paragraph('Invoice Number', metaL)],
        [Paragraph(f'{ci.invoice_number}', metaV)],
        [Paragraph('Date (DD/MM/YYYY)', metaL)],
        [Paragraph(f'{ci.invoice_date.strftime("%d/%m/%Y")}', metaV)],
    ]
    rc = Table(right_rows, colWidths=[RW], rowHeights=[6*mm, 6*mm, 6*mm, 6*mm])
    rc.setStyle(TableStyle([
        # Reference layout: medium-gray label strips with bold black text,
        # light-gray value cells. (Replaces earlier green/white scheme.)
        ('BACKGROUND', (0,0), (0,0), colors.HexColor('#d0d0d0')),  # Invoice Number label
        ('BACKGROUND', (0,1), (0,1), colors.HexColor('#f3f3f3')),  # value row
        ('BACKGROUND', (0,2), (0,2), colors.HexColor('#d0d0d0')),  # Date label
        ('BACKGROUND', (0,3), (0,3), colors.HexColor('#f3f3f3')),  # value row
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
    ]))

    # Per the reference PDF: top row is Exporter | Consignee | (Invoice meta).
    # Notify appears OPTIONALLY as a full-width row below.
    # For the 'buyer' template, the right-column of the top block is Buyer
    # (not Consignee); Consignee + Notify are rendered as a 2-column row below.
    # Strip color = #d9d9d9 (light gray) per spec.
    LIGHT_GREEN = colors.HexColor('#d9d9d9')
    if template == 'buyer':
        # Top block: Exporter | Buyer | Invoice meta.
        buyer_company = (getattr(ci, 'buyer_company_name', '') or '').upper()
        buyer_addr    = getattr(ci, 'buyer_address', '') or ''
        buyer_city    = getattr(ci, 'buyer_city_state_country', '') or ''
        buyer_pin     = getattr(ci, 'buyer_pincode', '') or ''
        buyer_ref     = getattr(ci, 'buyer_reference', '') or ''
        buyer_phone   = getattr(ci, 'buyer_phone', '') or ''
        rows = [
            [Paragraph('Exporter', head), Paragraph('Buyer', head), '', rc],
            [Paragraph((EXPORTER["name"] or '').upper(), bodyb),
             Paragraph(buyer_company, bodyb), '', ''],
            [Paragraph('D.no : 233, Aarthi Nagar,', body),
             Paragraph(buyer_addr, body), '', ''],
            [Paragraph('Mohan Nagar, Narasothipatti,', body),
             Paragraph(buyer_city, body), '', ''],
            [Paragraph('Salem - 636004, Tamilnadu', body),
             Paragraph(buyer_pin, body), '', ''],
            [Paragraph('Contact : +91 6385848466', body),
             Paragraph(f'Phone: {buyer_phone}' if buyer_phone else '', body), '', ''],
            [Paragraph(f'Email : {EXPORTER["email"]}', body),
             Paragraph(buyer_ref, body), '', ''],
            [Paragraph(f'GSTIN : {EXPORTER["gstin"]}', body), '', '', ''],
            [Paragraph(f'IEC : {EXPORTER["iec"]}', body), '', '', ''],
        ]
    else:
        client_email = (getattr(ci, 'client_email', '') or '').strip()
        rows = [
            [Paragraph('Exporter', head), Paragraph('Consignee', head), '', rc],
            [Paragraph((EXPORTER["name"] or '').upper(), bodyb),
             Paragraph((ci.client_company_name or '').upper(), bodyb), '', ''],
            [Paragraph('D.no : 233, Aarthi Nagar,', body),
             Paragraph(ci.client_address or '', body), '', ''],
            [Paragraph('Mohan Nagar, Narasothipatti,', body),
             Paragraph(ci.client_city_state_country or '', body), '', ''],
            [Paragraph('Salem - 636004, Tamilnadu', body),
             Paragraph(ci.client_pincode or '', body), '', ''],
            [Paragraph('Contact : +91 6385848466', body),
             Paragraph(f'Phone: {ci.client_phone}' if ci.client_phone else '', body), '', ''],
            [Paragraph(f'Email : {EXPORTER["email"]}', body),
             Paragraph(ci.client_tax_number or '', body), '', ''],
            [Paragraph(f'GSTIN : {EXPORTER["gstin"]}', body),
             Paragraph(f'Email : {client_email}' if client_email else '', body), '', ''],
            [Paragraph(f'IEC : {EXPORTER["iec"]}', body), '', '', ''],
        ]
    t1 = Table(rows, colWidths=[EW, CW2, GAP, RW], rowHeights=[6.5*mm]+[None]*8)
    t1.setStyle(TableStyle([
        # Gray strip ends at the right edge of the Consignee column (x=143mm).
        # GAP column (col 2) stays white so the gray never crosses the red
        # line into the right meta panel area.
        ('BACKGROUND', (0,0), (1,0), LIGHT_GREEN),
        ('BACKGROUND', (2,0), (2,0), W),
        ('BACKGROUND', (3,0), (3,0), W),
        ('LINEBELOW', (0,0), (1,0), 1.5, colors.HexColor('#d9d9d9'), 0, None, 0),
        ('VALIGN', (0,0), (1,0), 'MIDDLE'),
        ('SPAN', (3,0), (3,8)),
        ('VALIGN', (0,1), (-1,-1), 'TOP'),
        ('VALIGN', (3,0), (3,0), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 1.5),
        ('BOTTOMPADDING', (0,0), (-1,-1), 1.5),
        ('LEFTPADDING', (0,0), (1,-1), 6),
        ('LEFTPADDING', (3,0), (3,0), 0),
        ('RIGHTPADDING', (3,0), (3,0), 0),
        ('TOPPADDING', (3,0), (3,0), 0),
        ('BOTTOMPADDING', (3,0), (3,0), 0),
        ('LEFTPADDING', (2,0), (2,-1), 0),
        ('RIGHTPADDING', (2,0), (2,-1), 0),
    ]))
    el.append(t1)
    el.append(Spacer(1, 2*mm))

    # ═══ NOTIFY (optional, full-width) ═══
    # Template gating:
    #   'normal' → skip Notify entirely
    #   'notify' → render if notify_* fields populated (current behaviour)
    #   'buyer'  → render Notify | Consignee as a 2-column row spanning the
    #             full Exporter+Consignee gray-strip width (RW reserved on
    #             the right so it aligns with the table above).
    # Build the full Notify text block from all notify_* fields (in order).
    def _build_notify_lines():
        out = []
        if ci.notify_company_name:
            out.append((ci.notify_company_name or '').upper())
        if ci.notify_address:
            out.append(ci.notify_address)
        if getattr(ci, 'notify_city_state_country', ''):
            out.append(ci.notify_city_state_country)
        if getattr(ci, 'notify_pincode', ''):
            out.append(ci.notify_pincode)
        if getattr(ci, 'notify_tax_number', ''):
            out.append(ci.notify_tax_number)
        _ne = (getattr(ci, 'notify_email', '') or '').strip()
        if _ne:
            out.append(f'Email : {_ne}')
        if ci.notify_phone:
            out.append(f'Phone: {ci.notify_phone}')
        return out
    notify_lines = _build_notify_lines()
    if template == 'buyer':
        # Combined Notify | Consignee row — same outer dimensions as t1 above
        # so the gray header strip lines up across the page.
        HALF = (EW + CW2) / 2.0  # split the left+middle area in half
        # Honour optional-row hides set in the editor (X button → display_overrides._hide_<key>)
        _ov = ci.display_overrides if isinstance(ci.display_overrides, dict) else {}
        def _hidden(k):
            return bool(_ov.get(f'_hide_{k}'))
        # Notify column — exact order requested by the user.
        nl_lines = []
        if ci.notify_company_name:
            nl_lines.append((ci.notify_company_name or '').upper())
        if ci.notify_address:
            nl_lines.append(ci.notify_address)
        if getattr(ci, 'notify_city_state_country', ''):
            nl_lines.append(ci.notify_city_state_country)
        if getattr(ci, 'notify_pincode', '') and not _hidden('notify_cep'):
            nl_lines.append(ci.notify_pincode)
        if getattr(ci, 'notify_tax_number', ''):
            nl_lines.append(ci.notify_tax_number)
        if ci.notify_phone:
            nl_lines.append(f'Phone: {ci.notify_phone}')
        if getattr(ci, 'notify_mobile', '') and not _hidden('notify_mobile'):
            nl_lines.append(f'Mobile: {ci.notify_mobile}')
        _ne = (getattr(ci, 'notify_email', '') or '').strip()
        if _ne:
            nl_lines.append(f'Email : {_ne}')
        # Consignee column — only the requested 5 rows (no phone/email).
        cl_lines = []
        if ci.client_company_name:
            cl_lines.append((ci.client_company_name or '').upper())
        if ci.client_address:
            cl_lines.append(ci.client_address)
        if ci.client_city_state_country:
            cl_lines.append(ci.client_city_state_country)
        if ci.client_pincode and not _hidden('client_cep'):
            cl_lines.append(ci.client_pincode)
        if ci.client_tax_number:
            cl_lines.append(ci.client_tax_number)
        nmax = max(len(nl_lines), len(cl_lines), 1)
        # Shrink the body font for this block so long values (esp. emails) fit
        # on a single line inside the HALF-width columns. Each line auto-scales
        # further if it would still wrap at the base 7pt size.
        from reportlab.lib.styles import ParagraphStyle as _PS
        from reportlab.pdfbase.pdfmetrics import stringWidth as _sw
        _BASE = 7.0
        _MIN  = 5.0
        _USABLE = HALF - 8  # 6pt left pad + small right safety
        def _fit_size(txt, fontname):
            if not txt:
                return _BASE
            size = _BASE
            while size > _MIN and _sw(txt, fontname, size) > _USABLE:
                size -= 0.25
            return size
        def _para(txt, bold):
            fn = _bf if bold else _br
            sz = _fit_size(txt, fn)
            st = _PS('nf', fontName=fn, fontSize=sz, leading=sz + 1.5,
                     textColor=colors.black, alignment=0)
            return Paragraph(txt, st)
        nc_rows = [[Paragraph('Notify', head), Paragraph('Consignee', head), '']]
        for i in range(nmax):
            n_txt = nl_lines[i] if i < len(nl_lines) else ''
            c_txt = cl_lines[i] if i < len(cl_lines) else ''
            n_bold = (i == 0)
            c_bold = (i == 0)
            nc_rows.append([_para(n_txt, n_bold), _para(c_txt, c_bold), ''])
        nc = Table(nc_rows, colWidths=[HALF, HALF, GAP + RW], rowHeights=[6.5*mm] + [None]*nmax)
        nc.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (1,0), LIGHT_GREEN),
            ('BACKGROUND', (2,0), (2,-1), W),
            ('LINEBELOW',  (0,0), (1,0), 1.5, colors.HexColor('#d9d9d9'), 0, None, 0),
            ('VALIGN', (0,0), (1,0), 'MIDDLE'),
            ('VALIGN', (0,1), (-1,-1), 'TOP'),
            ('TOPPADDING', (0,0), (-1,-1), 1.5),
            ('BOTTOMPADDING', (0,0), (-1,-1), 1.5),
            ('LEFTPADDING', (0,0), (1,-1), 6),
            ('LEFTPADDING', (2,0), (2,-1), 0),
            ('RIGHTPADDING', (2,0), (2,-1), 0),
        ]))
        el.append(nc)
        el.append(Spacer(1, 3*mm))
    elif notify_lines and template == 'notify':
        # Notify table spans the FULL page width (so it positions identically
        # to the Exporter table above — no implicit centering). The gray
        # strip + bottom line are applied only to the first cell, which is
        # the same width as the Exporter column above (EW = 60mm). Strip
        # ends flush with where Exporter ends / Consignee begins.
        NOTIFY_W = EW              # = 60mm — gray strip extent
        SPACER_W = PW - NOTIFY_W   # remaining empty white space on the right
        nf_rows = [[Paragraph('Notify', head), '']]
        for i, line in enumerate(notify_lines):
            text = (line or '').upper() if i == 0 else line
            nf_rows.append([Paragraph(text, bodyb if i == 0 else body), ''])
        nf = Table(nf_rows, colWidths=[NOTIFY_W, SPACER_W])
        nf.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (0,0), LIGHT_GREEN),
            ('LINEBELOW',  (0,0), (0,0), 1.5, colors.HexColor('#d9d9d9'), 0, None, 0),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('TOPPADDING', (0,0), (-1,-1), 1.5),
            ('BOTTOMPADDING', (0,0), (-1,-1), 1.5),
            ('LEFTPADDING', (0,0), (0,-1), 6),       # only left col gets text padding
            ('LEFTPADDING', (1,0), (1,-1), 0),
            ('RIGHTPADDING', (0,0), (-1,-1), 0),
            ('TOPPADDING', (0,0), (0,0), 4),
            ('BOTTOMPADDING', (0,0), (0,0), 4),
            ('ALIGN', (0,0), (-1,-1), 'LEFT'),
        ]))
        el.append(nf)
        el.append(Spacer(1, 3*mm))

    # ═══ SHIPMENT DETAILS (left) + BANK DETAILS (right) — unified grid like reference ═══
    _rh = 7*mm
    # Parse bank details — prefer display_overrides (from editor), fall back to bank_details text
    ov = ci.display_overrides if isinstance(ci.display_overrides, dict) else {}
    ov_bank = {
        'Bank name': ov.get('_bank_name', ''),
        'Branch name': ov.get('_bank_branch', ''),
        'Beneficiary': ov.get('_bank_beneficiary', ''),
        'IFSC Code': ov.get('_bank_ifsc', ''),
        'Swift Code': ov.get('_bank_swift', ''),
        'A/C No': ov.get('_bank_ac', ''),
        'A/C Type': ov.get('_bank_ac_type', ''),
    }
    # Fall back to parsing bank_details text if overrides are empty
    bk_data = {}
    if any(v for v in ov_bank.values()):
        bk_data = ov_bank
    else:
        for line in (ci.bank_details or '').strip().split('\n'):
            if ':' in line:
                k, v = line.split(':', 1)
                bk_data[k.strip()] = v.strip()

    def bk(key):
        """Flexible bank-detail lookup with key variations."""
        for k in [key, key.lower(), key.replace(' ', ''), key.title()]:
            if k in bk_data:
                return bk_data[k]
        for k, v in bk_data.items():
            if key.lower().replace(' ', '') in k.lower().replace(' ', ''):
                return v
        return ''

    # Reference PDF layout — three blocks side-by-side after the sidebar:
    #   [SHIPMENT sidebar 10mm] | [bordered Shipment table] | [borderless Bank block]
    # 180mm budget after sidebar split as 95mm + 85mm (gap absorbed inside).
    _sw = PW - 10*mm
    SHIP_W = 110*mm
    BANK_W = _sw - SHIP_W   # = 76mm

    # Shipment table (bordered, NAVY labels)
    ship_rows = [
        [Paragraph('Country of Origin',   lb), Paragraph(ci.country_of_origin or 'India', vl)],
        [Paragraph('Port of Loading',     lb), Paragraph(ci.port_of_loading or '', vl)],
        [Paragraph('Vessel/Flight No.',   lb), Paragraph(ci.vessel_flight_no or '', vl)],
        [Paragraph('Port of Discharge',   lb), Paragraph(ci.port_of_discharge or '', vl)],
        [Paragraph('Final Destination',   lb), Paragraph(ci.country_of_final_destination or '', vl)],
        [Paragraph('Terms of Delivery',   lb), Paragraph(ci.terms_of_delivery or '', vl)],
        [Paragraph('Payment Terms',       lb), Paragraph(ci.terms_of_trade or ci.payment_terms or '', vl)],
        [Paragraph('Batch No',            lb), Paragraph(getattr(ci, 'batch_no', '') or '', vl)],
    ]
    # Label column = 50mm so the value column begins at x = 10mm (sidebar)
    # + 50mm = 60mm — exactly where the Consignee column starts above.
    st = Table(ship_rows, colWidths=[50*mm, SHIP_W - 50*mm])
    st.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 6),
    ]))

    # Bank block (borderless, "Label : Value"). When no bank is selected
    # (every value blank) render the value cell as a clean empty string —
    # avoid leaving stray ": " hanging next to the labels.
    def _bv(label):
        v = bk(label)
        return f': {v}' if v else ''

    bk_rows = [
        [Paragraph('Bank Details', bkH), ''],
        [Paragraph('Bank Name',   bkL), Paragraph(_bv("Bank name"),   bkV)],
        [Paragraph('Branch name', bkL), Paragraph(_bv("Branch name"), bkV)],
        [Paragraph('Beneficiary', bkL), Paragraph(_bv("Beneficiary"), bkV)],
        [Paragraph('IFSCode',     bkL), Paragraph(_bv("IFSC Code"),   bkV)],
        [Paragraph('Swift Code',  bkL), Paragraph(_bv("Swift Code"),  bkV)],
        [Paragraph('A/C No.',     bkL), Paragraph(_bv("A/C No"),      bkV)],
        [Paragraph('A/C Type',    bkL), Paragraph(_bv("A/C Type"),    bkV)],
    ]
    bt = Table(bk_rows, colWidths=[28*mm, BANK_W - 28*mm - 6*mm])
    bt.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('SPAN', (0,0), (1,0)),
        ('BOTTOMPADDING', (0,0), (-1,0), 5),
    ]))

    # Vertical green sidebar — height matches the actual rendered table.
    # At 8pt body + 3pt padding each row is ~5.5mm, so 8 rows ≈ 44mm.
    # Keep it slightly tighter so the sidebar doesn't extend past the data.
    _sidebar_h = 5.5 * mm * len(ship_rows)  # ≈ 44mm for 8 rows
    sidebar = RotatedText('SHIPMENT  DETAILS', 10*mm, _sidebar_h, G, 9, _mt)
    combo = Table([[sidebar, st, bt]], colWidths=[10*mm, SHIP_W, BANK_W])
    combo.setStyle(TableStyle([
        # Paint the sidebar cell green — this fills the FULL cell height
        # regardless of how tall the shipment table renders, so the green
        # strip never falls short of the data rows beside it.
        ('BACKGROUND', (0,0), (0,0), G),
        ('VALIGN', (0,0), (0,0), 'MIDDLE'),
        ('VALIGN', (1,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (2,0), (2,0), 18),  # bigger gap before bank block
        ('LEFTPADDING', (0,0), (1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
    ]))
    el.append(combo)
    el.append(Spacer(1, 1*mm))

    # ═══ PACKING DETAILS TABLE ═══
    # Register Arial for PACKING DETAILS (same as Quotation)
    _ar = _br
    try:
        arial_path = os.path.join(img_dir, 'Arial-Regular.ttf')
        if os.path.exists(arial_path):
            pdfmetrics.registerFont(TTFont('Arial-Regular', arial_path))
            _ar = 'Arial-Regular'
    except Exception:
        pass
    pd_title = Table(
        [[Paragraph('PACKING DETAILS', ParagraphStyle('pd', fontSize=20, textColor=colors.HexColor('#b8b8b8'), alignment=2, fontName=_ar, leading=24))]],
        colWidths=[PW],
    )
    pd_title.setStyle(TableStyle([
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), -5),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
    ]))
    el.append(pd_title)
    el.append(Spacer(1, 1*mm))

    # Widened so multi-line packaging text ("1000 Ltr IBC Container", etc.)
    # never wraps mid-word. Total spans the full usable page (196mm).
    CW = [30*mm, 52*mm, 45*mm, 20*mm, 24*mm, 25*mm]  # = 196mm

    # Header column styles — first column left-aligned ("Product Details"),
    # the remaining five headers centered per spec.
    hs  = ParagraphStyle('hs',  fontSize=7.5, fontName=_bf, textColor=W, leading=10, alignment=0)  # left
    hsc = ParagraphStyle('hsc', fontSize=7.5, fontName=_bf, textColor=W, leading=10, alignment=1)  # center
    hsr = ParagraphStyle('hsr', fontSize=7.5, fontName=_bf, textColor=W, leading=10, alignment=1)  # center (kept name for back-compat)
    hdr = [
        Paragraph('Product Details', hs),
        Paragraph('No. &amp; Kind of Packages', hsc),
        Paragraph('Description of Goods', hsc),
        Paragraph('Quantity', hsc),
        Paragraph('Price/Ltr', hsc),
        Paragraph('Amount', hsc),
    ]

    # Body styles — every cell BOLD per spec (was: only product_name bold).
    _bs  = ParagraphStyle('bs',  fontSize=7, leading=9, fontName=_bf)
    _bsc = ParagraphStyle('bsc', fontSize=7, leading=9, fontName=_bf)
    _bsb = ParagraphStyle('bsb', fontSize=7, leading=9, fontName=_bf)
    data = [hdr]
    xrate = float(ci.exchange_rate) if ci.exchange_rate else 0

    def _ci_wrap(text, style=None):
        import re as _re
        s = text or ''
        s = _re.sub(r' {2,}', lambda m: '&nbsp;' * len(m.group(0)), s)
        s = s.replace('\r\n', '\n').replace('\n', '<br/>')
        s = s.replace('\t', '&nbsp;&nbsp;&nbsp;&nbsp;')
        return Paragraph(s, style or _bs)

    for item in ci.items.all():
        data.append([
            _ci_wrap(item.product_name, _bsb),
            _ci_wrap(item.packages_description, _bsc),
            _ci_wrap(item.description_of_goods, _bsc),
            Paragraph(f'{item.quantity:,.0f} {item.unit}', ParagraphStyle('qc', fontSize=7, leading=9, fontName=_bf, alignment=1)),
            Paragraph(f'$ {item.unit_price:,.2f}', ParagraphStyle('pr', fontSize=7, leading=9, fontName=_bf, alignment=1)),
            Paragraph(f'$ {item.total_price:,.2f}', ParagraphStyle('au', fontSize=7, leading=9, fontName=_bf, alignment=1)),
        ])

    # Distribute available vertical space across item rows so the packing
    # table fills the A4 page proportionally:
    #   1 item  → ~60mm row     (matches reference single-product look)
    #   2 items → ~30mm each
    #   3 items → ~22mm each
    #   N items → max(MIN_ROW, TARGET / N), so big invoices don't overflow
    n_items = max(1, len(data) - 1)  # exclude header row
    TARGET_BODY_H = 65 * mm
    MIN_ROW_H     = 14 * mm
    if n_items == 1:
        # Single-product invoices left way too much empty space at the old
        # 65mm row height. Cap it tighter so the layout looks balanced.
        body_row_h = 22 * mm
    else:
        body_row_h = max(MIN_ROW_H, TARGET_BODY_H / n_items)
    row_heights   = [None] + [body_row_h] * n_items   # header auto, body fixed

    it = Table(data, colWidths=CW, rowHeights=row_heights)
    it.setStyle(TableStyle([
        # Header styling
        ('BACKGROUND', (0,0), (-1,0), G),
        ('TEXTCOLOR', (0,0), (-1,0), W),
        # Alignment: left for text cols, center for Qty, right for numbers
        ('ALIGN', (0,1), (2,-1), 'LEFT'),
        # Quantity, Price/Ltr, Amount — all center-aligned per spec.
        ('ALIGN', (3,1), (-1,-1), 'CENTER'),
        # Center body content vertically inside the taller rows so empty
        # space distributes evenly above & below — matches reference.
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        # Header padding
        ('TOPPADDING', (0,0), (-1,0), 4),
        ('BOTTOMPADDING', (0,0), (-1,0), 4),
        # Body padding (kept tight; the row HEIGHT does the breathing room)
        ('TOPPADDING', (0,1), (-1,-1), 4),
        ('BOTTOMPADDING', (0,1), (-1,-1), 4),
        ('LEFTPADDING', (0,1), (-1,-1), 4),
        ('RIGHTPADDING', (0,1), (-1,-1), 4),
    ]))
    el.append(it)

    # ═══ FINANCIAL BREAKDOWN — aligned with packing table columns ═══
    ts_g = ParagraphStyle('tsg', fontSize=11, textColor=colors.HexColor('#548b2e'), fontName=_bf, alignment=2, leading=14)
    TW = sum(CW)
    total_usd = sum(float(i.total_price) for i in ci.items.all())
    total_inr = total_usd * xrate
    frt = float(ci.freight or 0)
    ins = float(ci.insurance or 0)
    ov = ci.display_overrides if isinstance(ci.display_overrides, dict) else {}
    disc_mode = ov.get('_ci_discount_mode', 'usd')
    disc_input = float(ov.get('_ci_discount_usd', 0) or 0)
    disc_usd = (total_usd * disc_input / 100) if disc_mode == 'percent' else disc_input
    disc_inr = disc_usd * xrate if xrate else 0
    sub_usd = total_usd + frt + ins
    sub_inr = sub_usd * xrate
    igst_r = float(ci.igst_rate or 0)
    igst_a = sub_inr * igst_r / 100
    grand_inr = sub_inr + igst_a - disc_inr

    # Totals: spacer | label | amount
    TW = sum(CW)  # 190mm
    _amt = 40*mm
    _label = 30*mm
    _spacer = TW - _amt - _label
    tcw = [_spacer, _label, _amt]

    # Grand total in USD (primary currency)
    grand_usd = sub_usd - disc_usd

    totals_data = []
    if disc_usd:
        totals_data.append(['', f'Discount{f" ({disc_input}%)" if disc_mode == "percent" else ""}', f'$ {disc_usd:,.2f}'])
    totals_data.append(['', Paragraph('<b>Grand Total</b>', ts_g), Paragraph(f'<b>$ {grand_usd:,.2f}</b>', ts_g)])

    tot = Table(totals_data, colWidths=tcw)
    tot.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'RIGHT'),
        ('FONT', (0,0), (-1,-1), _bf),
        ('FONTSIZE', (0,0), (-1,-1), 9),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 8),
    ]))
    el.append(tot)
    el.append(Spacer(1, 3*mm))

    # NOTE: "Additional Details" block intentionally omitted — not part of
    # the Client Invoice Sample reference and dropping it keeps spacing clean.

    # ═══ Amount Chargeable strip ═══
    TW = sum(CW)
    ac_style = ParagraphStyle('ac', fontSize=9, fontName=_bf, alignment=1, leading=12)
    # Auto-generate amount in words if not manually set
    # Always derive amount-in-words from the live total so the format is
    # consistent across CIs (older saved values used the legacy "USD ..."
    # prefix; this enforces the new "<words> Dollars Only (USD)" suffix).
    _aiw = ''
    if grand_usd > 0:
        _aiw = f'{_number_to_words(round(grand_usd), "").strip()} Dollars Only (USD)'
    ac = Table([[Paragraph(f'<b>Amount Chargeable : {_aiw or ""}</b>', ac_style)]], colWidths=[TW])
    ac.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#d9ead3')),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    el.append(Spacer(1, 1*mm))
    el.append(ac)
    # No spacer — gray Declaration strip should touch the Amount Chargeable
    # strip directly above it (no white seam).

    # ═══ DECLARATION + SEAL/SIGN ═══
    seal = Image(seal_path, width=20*mm, height=20*mm) if os.path.exists(seal_path) else ''
    sign = Image(sign_path, width=22*mm, height=11*mm) if os.path.exists(sign_path) else ''

    decl_style = ParagraphStyle('decl',  fontSize=7, leading=9, fontName=_br, alignment=0)  # left
    decl_bold  = ParagraphStyle('declb', fontSize=7, leading=9, fontName=_bf, alignment=0)  # left
    decl_block = Table([
        [Paragraph('<b>Declaration :</b>', decl_bold)],
        [Paragraph('We Declare that this Invoice shows the Actual Price of the Goods described and that all particulars are true and correct', decl_style)],
        [Paragraph('<b>E. &amp; O.E</b>', decl_bold)],
    ], colWidths=[110*mm])
    decl_block.setStyle(TableStyle([
        # No background — Declaration sits on plain white. Generous vertical
        # padding gives blank-line breathing room between rows.
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 6),
        ('BOTTOMPADDING', (0,0), (-1,-1), 6),
    ]))

    auth_top = Paragraph('<b>For Kriya Biosys Private Limited</b>',
                         ParagraphStyle('fk', fontSize=7, alignment=1, fontName=_bf, leading=9))
    seal_sign = Table([[seal, sign]], colWidths=[22*mm, 25*mm])
    seal_sign.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'BOTTOM'), ('ALIGN', (0,0), (-1,-1), 'CENTER')]))
    auth_bottom = Paragraph('<b>Authorised Signature</b>',
                            ParagraphStyle('as3', fontSize=7, alignment=1, fontName=_bf, leading=9))

    right_block = Table([
        [auth_top],
        [seal_sign],
        [auth_bottom],
    ], colWidths=[70*mm])
    right_block.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
    ]))

    decl_row = Table([[decl_block, right_block]], colWidths=[TW - 72*mm, 72*mm])
    decl_row.setStyle(TableStyle([
        # Gray strip fills the full row height; signature stays white.
        ('BACKGROUND', (0,0), (0,0), colors.HexColor('#f3f3f3')),
        # Left cell content vertically centered → text sits middle of strip.
        ('VALIGN', (0,0), (0,0), 'MIDDLE'),
        # Right cell pushed down slightly via top padding so seal sits a bit
        # below the top edge of the row (matches reference layout).
        ('VALIGN', (1,0), (1,0), 'TOP'),
        ('TOPPADDING', (1,0), (1,0), 8),
        ('LEFTPADDING', (0,0), (0,0), 6),
        ('RIGHTPADDING', (0,0), (0,0), 0),
        ('TOPPADDING', (0,0), (0,0), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
    ]))
    el.append(decl_row)
    el.append(Spacer(1, 2*mm))

    # ═══ FOOTER ═══
    el.append(Paragraph('" Go Organic ! Save Planet ! "',
                        ParagraphStyle('m', fontSize=8.5, alignment=1, fontName=_br, textColor=colors.HexColor('#444444'), leading=11)))

    # Force the entire invoice onto one A4 page even with many line items.
    # mode='shrink' only kicks in when content overflows; under-full pages
    # render at 100% so single-line invoices stay crisp.
    from reportlab.platypus import KeepInFrame
    avail_w = A4[0] - 20*mm
    avail_h = A4[1] - 16*mm
    one_page = KeepInFrame(avail_w, avail_h, el, mode='shrink', hAlign='LEFT', vAlign='TOP')
    doc.build([one_page])
    buffer.seek(0)
    return buffer


def send_ci_email(ci, user):
    """Generate PDF, send to client, update status."""
    from communications.models import EmailAccount, Communication
    from communications.services import EmailService
    from django.core.files.base import ContentFile

    from communications.services import get_client_email_recipients
    contact_email, contact, cc_string = get_client_email_recipients(ci.client)
    if not contact_email:
        raise ValueError(f'No email for {ci.client_company_name}')

    email_account = EmailAccount.objects.filter(is_active=True).first()
    if not email_account:
        raise ValueError('No email account configured')

    pdf_buffer = generate_ci_pdf(ci)
    pdf_bytes = pdf_buffer.read()

    ci.pdf_file.save(f'{ci.invoice_number.replace("/", "-")}.pdf', ContentFile(pdf_bytes), save=True)

    subject = f'Commercial Invoice {ci.invoice_number} - Kriya Biosys'
    body_html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;">
        <h2 style="color:#4a7c2e;">Commercial Invoice</h2>
        <p>Dear {contact.name},</p>
        <p>Please find attached our Commercial Invoice <b>{ci.invoice_number}</b> dated {ci.invoice_date.strftime('%B %d, %Y')}.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:6px;color:#666;">Invoice Number</td><td style="padding:6px;font-weight:bold;">{ci.invoice_number}</td></tr>
            <tr><td style="padding:6px;color:#666;">Total ({ci.currency})</td><td style="padding:6px;font-weight:bold;">{ci.currency} {ci.total_invoice_usd:,.2f}</td></tr>
            <tr><td style="padding:6px;color:#666;">Terms</td><td style="padding:6px;">{ci.terms_of_trade or ci.payment_terms}</td></tr>
        </table>
        <p>Please review and confirm. Looking forward to your response.</p>
        <p>Best regards,<br/><b>Kriya Biosys Private Limited</b><br/><i>"Go Organic! Save Planet!"</i></p>
    </div>
    """

    from io import BytesIO
    pdf_file = BytesIO(pdf_bytes)
    pdf_file.name = f'CI_{ci.invoice_number.replace("/", "-")}.pdf'

    from communications.services import get_thread_headers
    # Prefer the CI's own source comm; fall back to the linked Order's
    # anchored thread; finally fall back to client-wide thread search.
    src_comm = (
        getattr(ci, 'source_communication', None)
        or getattr(getattr(ci, 'order', None), 'source_communication', None)
    )
    in_reply_to, references, reply_subject = get_thread_headers(ci.client, src_comm)
    if reply_subject:
        subject = reply_subject

    sent_message_id = EmailService.send_email(
        email_account=email_account, to=contact_email,
        subject=subject, body_html=body_html,
        attachments=[pdf_file],
        cc=cc_string or None,
        in_reply_to=in_reply_to,
        references=references,
    ) or ''

    ci.status = 'sent'
    ci.save(update_fields=['status'])

    Communication.objects.create(
        client=ci.client, contact=contact, user=user,
        comm_type='email', direction='outbound',
        subject=subject, body=body_html, status='sent',
        email_account=email_account, external_email=contact_email,
        email_cc=cc_string,
        email_message_id=sent_message_id,
        email_in_reply_to=in_reply_to or '',
        email_references=references or '',
    )

    return contact_email


def _number_to_words(num, currency='USD'):
    """Convert number to words with Indian numbering (Lakh, Crore)."""
    try:
        ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
                'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
                'Seventeen', 'Eighteen', 'Nineteen']
        tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

        def _convert(n):
            n = int(n)
            if n < 20:
                return ones[n]
            if n < 100:
                return tens[n // 10] + (' ' + ones[n % 10] if n % 10 else '')
            if n < 1000:
                return ones[n // 100] + ' Hundred' + (' ' + _convert(n % 100) if n % 100 else '')
            if n < 100000:
                return _convert(n // 1000) + ' Thousand' + (' ' + _convert(n % 1000) if n % 1000 else '')
            if n < 10000000:
                return _convert(n // 100000) + ' Lakh' + (' ' + _convert(n % 100000) if n % 100000 else '')
            return _convert(n // 10000000) + ' Crore' + (' ' + _convert(n % 10000000) if n % 10000000 else '')

        whole = int(num)
        prefix = f'{currency} ' if currency else ''
        return f'{prefix}{_convert(whole)} Only'
    except Exception:
        return f'{currency} {num:,.2f}'
