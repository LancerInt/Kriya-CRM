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


def generate_ci_pdf(ci):
    """Generate PDF matching the Kriya Biosys Commercial Invoice template."""
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
                            leftMargin=10*mm, rightMargin=10*mm,
                            title=pdf_title, author='Kriya Biosys Private Limited')
    styles = getSampleStyleSheet()
    el = []

    G = colors.HexColor('#558b2f')   # Kriya green
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

    PW = 190*mm  # page width

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

    # Styles
    s8 = ParagraphStyle('s8', parent=styles['Normal'], fontSize=8, leading=10, fontName=_br)
    s7 = ParagraphStyle('s7', parent=styles['Normal'], fontSize=7, leading=9, fontName=_br)
    s8b = ParagraphStyle('s8b', parent=styles['Normal'], fontSize=8, leading=10, fontName=_bf)
    lb = ParagraphStyle('lb', parent=styles['Normal'], fontSize=8, leading=11, fontName=_bf, textColor=NAVY)
    vl = ParagraphStyle('vl', parent=styles['Normal'], fontSize=8, leading=11, fontName=_br)

    # ═══ ROW 1: Logo + INVOICE title (DistinctStyleSans-Light) ═══
    # Use RW=50mm — same width as the Invoice Number / Date panel below
    logo = Image(logo_path, width=38*mm, height=23*mm) if os.path.exists(logo_path) else ''
    RW = 50*mm
    GAP = 3*mm
    EW = 60*mm
    CW2 = PW - EW - GAP - RW
    title_p = Paragraph('INVOICE', ParagraphStyle('ti', fontSize=18, textColor=W, fontName=_mt, alignment=1, leading=20))
    title_box = Table([[title_p]], colWidths=[RW], rowHeights=[23*mm])
    title_box.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), G),
        ('VALIGN', (0,0), (-1,-1), 'BOTTOM'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
    ]))
    # Use same 4-column layout as exporter row: EW | CW2 | GAP | RW
    h0 = Table([[logo, '', '', title_box]], colWidths=[EW, CW2, GAP, RW])
    h0.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('SPAN', (0,0), (1,0)),
        ('LEFTPADDING', (3,0), (3,0), 0),
        ('RIGHTPADDING', (3,0), (3,0), 0),
        ('TOPPADDING', (3,0), (3,0), 0),
        ('BOTTOMPADDING', (3,0), (3,0), 0),
    ]))
    el.append(h0)
    el.append(Spacer(1, 1*mm))

    # ═══ ROW 2: Exporter | Consignee + Notify | Invoice No + Date ═══
    MDG = colors.HexColor('#d5d5d5')
    VLG = colors.HexColor('#f0f0f0')

    # Right column: Invoice Number + Date
    right_rows = [
        [Paragraph('<b>Invoice Number</b>', ParagraphStyle('pn', fontSize=10, fontName=_bf, alignment=1))],
        [Paragraph(f'{ci.invoice_number}', ParagraphStyle('pv', fontSize=10, fontName=_br, alignment=1))],
        [Paragraph('<b>Date</b>', ParagraphStyle('dl', fontSize=10, fontName=_bf, alignment=1))],
        [Paragraph(f'{ci.invoice_date.strftime("%d-%m-%Y")}', ParagraphStyle('dv', fontSize=10, fontName=_br, alignment=1))],
    ]
    rc = Table(right_rows, colWidths=[RW], rowHeights=[7*mm, 7*mm, 7*mm, 7*mm])
    rc.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (0,0), MDG),
        ('BACKGROUND', (0,1), (0,1), VLG),
        ('BACKGROUND', (0,2), (0,2), MDG),
        ('BACKGROUND', (0,3), (0,3), VLG),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
    ]))

    rows = [
        [Paragraph('Exporter', s8b), Paragraph('Notify', s8b), '', rc],
        [Paragraph(EXPORTER["name"], s8b), Paragraph(ci.notify_company_name or ci.client_company_name, s8b), '', ''],
        [Paragraph('D.no : 233, Aarthi Nagar,', s7), Paragraph(ci.notify_address or ci.client_address or '', s7), '', ''],
        [Paragraph('Mohan Nagar, Narasothipatti,', s7), Paragraph(f'{ci.client_pincode}', s7), '', ''],
        [Paragraph('Salem - 636004, Tamilnadu', s7), Paragraph(f'{ci.client_city_state_country}', s7), '', ''],
        [Paragraph(f'Contact : +91 6385848466', s7), Paragraph(f'{ci.client_tax_number}', s7), '', ''],
        [Paragraph(f'Email : {EXPORTER["email"]}', s7), Paragraph(f'Tel: {ci.notify_phone or ci.client_phone}', s7), '', ''],
        [Paragraph(f'GSTIN : {EXPORTER["gstin"]}', s7), '', '', ''],
        [Paragraph(f'IEC : {EXPORTER["iec"]}', s7), '', '', ''],
    ]
    t1 = Table(rows, colWidths=[EW, CW2, GAP, RW], rowHeights=[7*mm]+[None]*8)
    t1.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (1,0), colors.HexColor('#d5d5d5')),
        ('BACKGROUND', (2,0), (2,0), W),
        ('BACKGROUND', (3,0), (3,0), W),
        ('LINEBELOW', (0,0), (1,0), 0.3, GR),
        ('VALIGN', (0,0), (1,0), 'MIDDLE'),
        ('SPAN', (3,0), (3,8)),
        ('VALIGN', (0,1), (-1,-1), 'TOP'),
        ('VALIGN', (3,0), (3,0), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 1),
        ('BOTTOMPADDING', (0,0), (-1,-1), 1),
        ('LEFTPADDING', (0,0), (1,-1), 3),
        ('LEFTPADDING', (3,0), (3,0), 0),
        ('RIGHTPADDING', (3,0), (3,0), 0),
        ('TOPPADDING', (3,0), (3,0), 0),
        ('BOTTOMPADDING', (3,0), (3,0), 0),
        ('LEFTPADDING', (2,0), (2,-1), 0),
        ('RIGHTPADDING', (2,0), (2,-1), 0),
    ]))
    el.append(t1)
    el.append(Spacer(1, 1*mm))

    # ═══ CONSIGNEE (To the Order) — width matches exporter+notify columns ═══
    consignee_rows = [
        [Paragraph('<b>Consignee</b>', s8b)],
        [Paragraph(f'To the Order {ci.client_city_state_country or ci.country_of_final_destination or ""}', s7)],
    ]
    cn = Table(consignee_rows, colWidths=[PW])
    cn.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (0,0), colors.HexColor('#d5d5d5')),
        ('LINEBELOW', (0,0), (0,0), 0.3, GR),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 1),
        ('BOTTOMPADDING', (0,0), (-1,-1), 1),
        ('LEFTPADDING', (0,0), (-1,-1), 3),
        ('ALIGN', (0,0), (-1,-1), 'LEFT'),
    ]))
    cn.hAlign = 'LEFT'
    el.append(cn)
    el.append(Spacer(1, 2*mm))

    # ═══ SHIPMENT DETAILS (left) + BANK DETAILS (right) — unified grid like reference ═══
    _rh = 7*mm
    # Parse bank details
    bk_data = {}
    for line in (ci.bank_details or '').strip().split('\n'):
        if ':' in line:
            k, v = line.split(':', 1)
            bk_data[k.strip()] = v.strip()

    # 4 columns: ShipLabel(38) | ShipValue(55) | BankLabel(25) | BankValue(rest) = 180mm
    _sw = PW - 10*mm  # 180mm after sidebar
    sc = [38*mm, 55*mm, 25*mm, _sw - 38*mm - 55*mm - 25*mm]

    # Flexible bank data lookup
    def bk(key):
        """Look up bank detail by key, trying common variations."""
        for k in [key, key.lower(), key.replace(' ', ''), key.title()]:
            if k in bk_data:
                return bk_data[k]
        # Fuzzy match
        for k, v in bk_data.items():
            if key.lower().replace(' ', '') in k.lower().replace(' ', ''):
                return v
        return ''

    # Helper: format bank value with colon only if value exists
    def bkv(key):
        v = bk(key)
        return f': {v}' if v else ''

    # Helper: shipment value with colon
    def sv(val):
        return f': {val}' if val else ''

    grid = [
        [Paragraph('<b>Country of Origin</b>', lb), Paragraph(sv(ci.country_of_origin or 'India'), vl),
         Paragraph('<b>Bank Details</b>', s8b), ''],
        [Paragraph('<b>Port of Loading</b>', lb), Paragraph(sv(ci.port_of_loading), vl),
         Paragraph('<b>Bank Name</b>', lb), Paragraph(bkv("Bank name"), vl)],
        [Paragraph('<b>Vessel / Flight No</b>', lb), Paragraph(sv(ci.vessel_flight_no), vl),
         Paragraph('<b>Branch name</b>', lb), Paragraph(bkv("Branch name"), vl)],
        [Paragraph('<b>Port of Discharge</b>', lb), Paragraph(sv(ci.port_of_discharge), vl),
         Paragraph('<b>Beneficiary</b>', lb), Paragraph(bkv("Beneficiary"), vl)],
        [Paragraph('<b>Country of Final Dest.</b>', lb), Paragraph(sv(ci.country_of_final_destination), vl),
         Paragraph('<b>IFSC Code</b>', lb), Paragraph(bkv("IFSC Code"), vl)],
        [Paragraph('<b>Incoterms</b>', lb), Paragraph(sv(ci.terms_of_delivery), vl),
         Paragraph('<b>Swift Code</b>', lb), Paragraph(bkv("Swift Code"), vl)],
        [Paragraph('<b>Terms of Trade</b>', lb), Paragraph(sv(ci.payment_terms), vl),
         Paragraph('<b>A/C No.</b>', lb), Paragraph(bkv("A/C No"), vl)],
        [Paragraph('<b>Buyer Reference</b>', lb), Paragraph(sv(ci.buyer_order_no), vl),
         Paragraph('<b>A/C Type</b>', lb), Paragraph(bkv("A/C Type"), vl)],
        [Paragraph('<b>Exchange Rate per USD</b>', lb), Paragraph(f': Rs.{ci.exchange_rate}' if ci.exchange_rate else '', vl),
         '', ''],
        [Paragraph('<b>Batch No.</b>', lb), Paragraph(sv(ci.batch_no) if hasattr(ci, 'batch_no') else '', vl),
         '', ''],
    ]
    st = Table(grid, colWidths=sc, rowHeights=[_rh]*10)
    st.setStyle(TableStyle([
        ('FONTSIZE', (0,0), (-1,-1), 7),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 1),
        ('BOTTOMPADDING', (0,0), (-1,-1), 1),
        ('LEFTPADDING', (0,0), (-1,-1), 3),
        ('SPAN', (2,0), (3,0)),  # "Bank Details" header spans 2 cols
    ]))

    sidebar = RotatedText('SHIPMENT  DETAILS', 10*mm, 10*_rh, G, 9, _mt)
    combo = Table([[sidebar, st]], colWidths=[10*mm, _sw])
    combo.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
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
    pd_title = Table([[Paragraph('PACKING DETAILS', ParagraphStyle('pd', fontSize=18, textColor=colors.HexColor('#aaaaaa'), alignment=2, fontName=_ar))]], colWidths=[PW])
    el.append(pd_title)
    el.append(Spacer(1, 1*mm))

    # Product Name(30) | Packages(30) | Product Details(38) | Qty(16) | Price/Kg(22) | USD(27) | INR(27) = 190mm
    CW = [30*mm, 30*mm, 38*mm, 16*mm, 22*mm, 27*mm, 27*mm]

    hs = ParagraphStyle('hs', fontSize=7, fontName=_bf, textColor=W, leading=9)
    hsr = ParagraphStyle('hsr', fontSize=7, fontName=_bf, textColor=W, leading=9, alignment=2)
    hsc = ParagraphStyle('hsc', fontSize=7, fontName=_bf, textColor=W, leading=9, alignment=1)
    hdr = [
        Paragraph('Product Name', hs),
        Paragraph('No. & Kind of<br/>Packages', hs),
        Paragraph('Product Details', hs),
        Paragraph('Quantity', hsc),
        Paragraph('Price/Kg', hsr),
        Paragraph('Amount in<br/>USD', hsr),
        Paragraph('Amount in<br/>INR', hsr),
    ]

    _bs = ParagraphStyle('bs', fontSize=7, leading=9, fontName=_br)
    data = [hdr]
    xrate = float(ci.exchange_rate) if ci.exchange_rate else 0
    for item in ci.items.all():
        inr_val = float(item.total_price) * xrate if xrate else 0
        data.append([
            Paragraph(item.product_name or '', _bs),
            Paragraph(item.packages_description or '', _bs),
            Paragraph(item.description_of_goods or '', _bs),
            f'{item.quantity:,.0f}',
            f'{item.unit_price:,.2f}',
            f'${item.total_price:,.2f}',
            f'Rs.{inr_val:,.2f}' if xrate else 'Rs.0.00',
        ])

    it = Table(data, colWidths=CW)
    it.setStyle(TableStyle([
        # Header styling
        ('BACKGROUND', (0,0), (-1,0), G),
        ('TEXTCOLOR', (0,0), (-1,0), W),
        # Body styling — regular weight, clean
        ('FONT', (0,1), (-1,-1), _br),
        ('FONTSIZE', (0,1), (-1,-1), 8),
        # Alignment: left for text cols, center for Qty, right for numbers
        ('ALIGN', (0,1), (2,-1), 'LEFT'),
        ('ALIGN', (3,1), (3,-1), 'CENTER'),
        ('ALIGN', (4,1), (-1,-1), 'RIGHT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        # Compact padding with extra gap between columns
        ('TOPPADDING', (0,0), (-1,0), 4),
        ('BOTTOMPADDING', (0,0), (-1,0), 4),
        ('TOPPADDING', (0,1), (-1,-1), 3),
        ('BOTTOMPADDING', (0,1), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    el.append(it)

    # ═══ FINANCIAL BREAKDOWN — aligned with packing table columns ═══
    ts_g = ParagraphStyle('tsg', fontSize=8, textColor=G, fontName=_bf, alignment=2)
    TW = sum(CW)
    total_usd = sum(float(i.total_price) for i in ci.items.all())
    total_inr = total_usd * xrate
    frt = float(ci.freight or 0)
    ins = float(ci.insurance or 0)
    disc_usd = float(ci.display_overrides.get('_ci_discount_usd', 0) if isinstance(ci.display_overrides, dict) else 0) or 0
    disc_inr = float(ci.display_overrides.get('_ci_discount', 0) if isinstance(ci.display_overrides, dict) else 0) or 0
    sub_usd = total_usd + frt + ins
    sub_inr = sub_usd * xrate
    igst_r = float(ci.igst_rate or 0)
    igst_a = sub_inr * igst_r / 100
    grand_inr = sub_inr + igst_a - disc_inr

    # Use same CW columns: spacer fills first 4 cols, then label(Price/Kg) + USD + INR
    # CW = [30, 30, 38, 16, 22, 27, 27] = 190mm
    # We want: empty(30+30+38) | label(16+22=38) | USD(27) | INR(27)
    _spacer = CW[0] + CW[1] + CW[2]  # 98mm
    _label = CW[3] + CW[4]  # 38mm
    _usd = CW[5]  # 27mm
    _inr = CW[6]  # 27mm
    tcw = [_spacer, _label, _usd, _inr]

    totals_data = [
        ['', 'Discount', f'${disc_usd:,.2f}', f'Rs.{disc_inr:,.2f}'],
        ['', 'Sub Total', f'${sub_usd:,.2f}', f'Rs.{sub_inr:,.2f}' if xrate else '-'],
    ]
    if igst_r:
        totals_data.append(['', f'GST {igst_r}%', '', f'Rs.{igst_a:,.2f}' if xrate else '-'])
    totals_data.append(['', Paragraph('<b>Grand Total</b>', ts_g), '', Paragraph(f'<b>Rs.{grand_inr:,.2f}</b>', ts_g) if xrate else Paragraph('-', ts_g)])

    tot = Table(totals_data, colWidths=tcw)
    tot.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'RIGHT'),
        ('FONT', (0,0), (-1,-1), _bf),
        ('FONTSIZE', (0,0), (-1,-1), 7),
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
        ('LINEBELOW', (1,-1), (-1,-1), 0.5, G),
    ]))
    el.append(tot)
    el.append(Spacer(1, 2*mm))

    # ═══ ADDITIONAL DETAILS ═══
    ad_style = ParagraphStyle('ad', fontSize=7, leading=9, fontName=_br)
    ad_bold = ParagraphStyle('adb', fontSize=7, leading=9, fontName=_bf)
    el.append(Paragraph('<b><u>Additional Details</u></b>', ad_bold))
    el.append(Paragraph(f'<b>FOB</b> : ${total_usd:,.2f}', ad_style))
    el.append(Paragraph(f'<b>Shipping &amp; Forwarding</b> : ${frt:,.2f}', ad_style))
    el.append(Paragraph(f'<b>Insurance</b> : ${ins:,.2f}', ad_style))

    # ═══ Amount Chargeable strip ═══
    TW = sum(CW)
    ac_style = ParagraphStyle('ac', fontSize=9, fontName=_bf, alignment=1)
    ac = Table([[Paragraph(f'Amount In Words : {ci.amount_in_words or ""}', ac_style)]], colWidths=[TW])
    ac.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#dce9d0')),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    el.append(Spacer(1, 1*mm))
    el.append(ac)
    el.append(Spacer(1, 3*mm))

    # ═══ DECLARATION + SEAL/SIGN ═══
    seal = Image(seal_path, width=20*mm, height=20*mm) if os.path.exists(seal_path) else ''
    sign = Image(sign_path, width=22*mm, height=11*mm) if os.path.exists(sign_path) else ''

    decl_style = ParagraphStyle('decl', fontSize=7, leading=9, fontName=_br)
    decl_block = Table([
        [Paragraph('<b>Declaration :</b>', decl_style)],
        [Paragraph('We Declare that this Invoice shows the Actual Price of the Goods described and that all particulars are true and correct', decl_style)],
        [Paragraph('<b>E. &amp; O.E</b>', decl_style)],
    ], colWidths=[100*mm])
    decl_block.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 1),
        ('BOTTOMPADDING', (0,0), (-1,-1), 1),
    ]))

    auth_top = Paragraph('<b>For Kriya Biosys Private Limited</b>',
                         ParagraphStyle('fk', fontSize=9, alignment=1, fontName=_bf))
    seal_sign = Table([[seal, sign]], colWidths=[22*mm, 25*mm])
    seal_sign.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'BOTTOM'), ('ALIGN', (0,0), (-1,-1), 'CENTER')]))
    auth_bottom = Paragraph('Authorised Signature',
                            ParagraphStyle('as3', fontSize=9, alignment=1, fontName=_br))

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
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (0,0), 0),
        ('RIGHTPADDING', (0,0), (0,0), 0),
    ]))
    el.append(decl_row)
    el.append(Spacer(1, 2*mm))

    # ═══ FOOTER ═══
    el.append(Paragraph('" Go Organic ! Save Planet ! "',
                        ParagraphStyle('m', fontSize=8, alignment=1, fontName=_bf)))

    doc.build(el)
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
            <tr><td style="padding:6px;color:#666;">Terms</td><td style="padding:6px;">{ci.payment_terms}</td></tr>
        </table>
        <p>Please review and confirm. Looking forward to your response.</p>
        <p>Best regards,<br/><b>Kriya Biosys Private Limited</b><br/><i>"Go Organic! Save Planet!"</i></p>
    </div>
    """

    from io import BytesIO
    pdf_file = BytesIO(pdf_bytes)
    pdf_file.name = f'CI_{ci.invoice_number.replace("/", "-")}.pdf'

    EmailService.send_email(
        email_account=email_account, to=contact_email,
        subject=subject, body_html=body_html,
        attachments=[pdf_file],
        cc=cc_string or None,
    )

    ci.status = 'sent'
    ci.save(update_fields=['status'])

    Communication.objects.create(
        client=ci.client, contact=contact, user=user,
        comm_type='email', direction='outbound',
        subject=subject, body=body_html, status='sent',
        email_account=email_account, external_email=contact_email,
        email_cc=cc_string,
    )

    return contact_email


def _number_to_words(num, currency='USD'):
    """Convert number to words (simplified)."""
    try:
        ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
                'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
                'Seventeen', 'Eighteen', 'Nineteen']
        tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety']

        def _convert(n):
            if n < 20:
                return ones[int(n)]
            if n < 100:
                return tens[int(n) // 10] + (' ' + ones[int(n) % 10] if int(n) % 10 else '')
            if n < 1000:
                return ones[int(n) // 100] + ' Hundred' + (' and ' + _convert(int(n) % 100) if int(n) % 100 else '')
            if n < 1000000:
                return _convert(int(n) // 1000) + ' Thousand' + (' ' + _convert(int(n) % 1000) if int(n) % 1000 else '')
            return str(int(n))

        whole = int(num)
        return f'{currency} {_convert(whole)} Only'
    except Exception:
        return f'{currency} {num:,.2f}'
