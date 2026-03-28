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
    for item in order.items.all():
        CommercialInvoiceItem.objects.create(
            ci=ci,
            product_name=item.product_name,
            hsn_code='',
            packages_description=f'{int(item.quantity)} {item.unit} Container Packing',
            description_of_goods=item.description or item.product_name,
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
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=12*mm, bottomMargin=10*mm,
                            leftMargin=10*mm, rightMargin=10*mm)
    styles = getSampleStyleSheet()
    el = []

    G = colors.HexColor('#4a7c2e')   # Kriya green
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

    # Register fonts — Bookman Old Style (classic Windows serif)
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    _tf = 'Helvetica-Bold'
    _bf = 'Helvetica-Bold'
    _br = 'Helvetica'
    try:
        bos_bold = os.path.join(img_dir, 'BookmanOldStyle-Bold.ttf')
        bos_reg = os.path.join(img_dir, 'BookmanOldStyle-Regular.ttf')
        dss_path = os.path.join(img_dir, 'DistinctStyleSans-Light.ttf')
        if os.path.exists(bos_bold):
            pdfmetrics.registerFont(TTFont('BookmanOldStyle-Bold', bos_bold))
            _bf = 'BookmanOldStyle-Bold'
        if os.path.exists(bos_reg):
            pdfmetrics.registerFont(TTFont('BookmanOldStyle', bos_reg))
            _br = 'BookmanOldStyle'
        if os.path.exists(dss_path):
            pdfmetrics.registerFont(TTFont('DistinctSans-Light', dss_path))
            _tf = 'DistinctSans-Light'
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
    title_p = Paragraph('INVOICE', ParagraphStyle('ti', fontSize=14, textColor=W, fontName='Helvetica-Bold', alignment=1, leading=24))
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
        [Paragraph('Exporter', s8b), Paragraph('Consignee', s8b), '', rc],
        [Paragraph(EXPORTER["name"], s8b), Paragraph(ci.client_company_name, s8b), '', ''],
        [Paragraph('D.no : 233, Aarthi Nagar,', s7), Paragraph(f'{ci.client_tax_number}', s7), '', ''],
        [Paragraph('Mohan Nagar, Narasothipatti,', s7), Paragraph(f'{ci.client_address}', s7), '', ''],
        [Paragraph('Salem - 636004, Tamilnadu', s7), Paragraph(f'{ci.client_pincode}', s7), '', ''],
        [Paragraph(f'GSTIN : {EXPORTER["gstin"]}', s7), Paragraph(f'{ci.client_city_state_country}', s7), '', ''],
        [Paragraph(f'EMAIL : {EXPORTER["email"]}', s7), Paragraph(f'Tel: {ci.client_phone}', s7), '', ''],
        [Paragraph(f'IEC : {EXPORTER["iec"]}', s7), '', '', ''],
    ]
    t1 = Table(rows, colWidths=[EW, CW2, GAP, RW], rowHeights=[7*mm]+[None]*7)
    t1.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (1,0), colors.HexColor('#d5d5d5')),
        ('BACKGROUND', (2,0), (2,0), W),
        ('BACKGROUND', (3,0), (3,0), W),
        ('LINEBELOW', (0,0), (1,0), 0.3, GR),
        ('VALIGN', (0,0), (1,0), 'MIDDLE'),
        ('SPAN', (3,0), (3,7)),
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

    # ═══ NOTIFY PARTY ═══
    if ci.notify_company_name:
        notify_rows = [
            [Paragraph('<b>Notify Party</b>', s8b)],
            [Paragraph(ci.notify_company_name, s8b)],
            [Paragraph(ci.notify_address, s7)],
            [Paragraph(f'Tel: {ci.notify_phone}', s7)],
        ]
        nt = Table(notify_rows, colWidths=[PW])
        nt.setStyle(TableStyle([
            ('BACKGROUND', (0,0), (0,0), colors.HexColor('#d5d5d5')),
            ('LINEBELOW', (0,0), (0,0), 0.3, GR),
            ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
            ('TOPPADDING', (0,0), (-1,-1), 1),
            ('BOTTOMPADDING', (0,0), (-1,-1), 1),
            ('LEFTPADDING', (0,0), (-1,-1), 3),
        ]))
        el.append(nt)
        el.append(Spacer(1, 1*mm))

    # ═══ SHIPMENT / LOADING DETAILS ═══
    sd = [
        [Paragraph('<b>Country of Origin</b>', lb), Paragraph(ci.country_of_origin, vl),
         Paragraph('<b>Country of Final Destination</b>', lb), Paragraph(ci.country_of_final_destination, vl)],
        [Paragraph('<b>Port of Loading</b>', lb), Paragraph(ci.port_of_loading or '', vl),
         Paragraph('<b>Port of Discharge</b>', lb), Paragraph(ci.port_of_discharge or '', vl)],
        [Paragraph('<b>Vessel / Flight No</b>', lb), Paragraph(ci.vessel_flight_no or '', vl),
         Paragraph('<b>Final Destination</b>', lb), Paragraph(ci.final_destination or '', vl)],
        [Paragraph('<b>Pre-Carriage By</b>', lb), Paragraph(ci.pre_carriage_by or '', vl),
         Paragraph('<b>Place of Receipt</b>', lb), Paragraph(ci.place_of_receipt or '', vl)],
        [Paragraph('<b>Terms of Delivery</b>', lb), Paragraph(ci.terms_of_delivery or '', vl),
         Paragraph('<b>Payment Terms</b>', lb), Paragraph(ci.payment_terms or '', vl)],
        [Paragraph('<b>Buyer Order No.</b>', lb),
         Paragraph(f'{ci.buyer_order_no} dt. {ci.buyer_order_date.strftime("%d-%m-%Y") if ci.buyer_order_date else ""}', vl),
         '', ''],
    ]
    _sw = PW - 8*mm  # 182mm
    # Label1(30) + Value1(52) + Label2(42) + Value2(58) = 182mm — wide values to avoid wrapping
    st = Table(sd, colWidths=[30*mm, 52*mm, 42*mm, _sw - 30*mm - 52*mm - 42*mm])
    st.setStyle(TableStyle([
        ('FONTSIZE', (0,0), (-1,-1), 8),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,0), 1),
        ('TOPPADDING', (0,1), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
    ]))
    sidebar = RotatedText('SHIPMENT  DETAILS', 8*mm, 38*mm, G, 7, _tf)
    sw = Table([[sidebar, st]], colWidths=[8*mm, PW - 8*mm])
    sw.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
    ]))
    el.append(sw)
    el.append(Spacer(1, 1*mm))

    # ═══ DESCRIPTION OF GOODS TABLE ═══
    _cf = 'Comfortaa-Bold' if 'Comfortaa-Bold' in pdfmetrics.getRegisteredFontNames() else 'Helvetica'
    # Product(24) Packages(40) Description(38) HSN(16) Qty(12) Rate(20) USD(22) INR(18) = 190mm
    CW = [24*mm, 40*mm, 38*mm, 16*mm, 12*mm, 20*mm, 22*mm, 18*mm]

    pd_title = Table([[Paragraph('DESCRIPTION OF GOODS', ParagraphStyle('pd', fontSize=14, textColor=colors.HexColor('#aaaaaa'), alignment=2, fontName=_cf))]], colWidths=[sum(CW)])
    el.append(pd_title)
    el.append(Spacer(1, 1*mm))

    # Header row using Paragraphs for wrapping control
    hs = ParagraphStyle('hs', fontSize=7, fontName=_bf, textColor=W, leading=9)
    hsr = ParagraphStyle('hsr', fontSize=7, fontName=_bf, textColor=W, leading=9, alignment=2)
    hsc = ParagraphStyle('hsc', fontSize=7, fontName=_bf, textColor=W, leading=9, alignment=1)
    hdr = [
        Paragraph('Product Details', hs),
        Paragraph('No. & Kind of Packages', hs),
        Paragraph('Description of Goods', hs),
        Paragraph('HSN Code', hsc),
        Paragraph('Qty', hsc),
        Paragraph('Rate', hsr),
        Paragraph(f'Amount<br/>({ci.currency})', hsr),
        Paragraph('Amount<br/>(INR)', hsr),
    ]

    data = [hdr]
    for item in ci.items.all():
        inr_val = float(item.total_price) * float(ci.exchange_rate) if ci.exchange_rate else 0
        data.append([
            item.product_name,
            item.packages_description,
            item.description_of_goods,
            item.hsn_code or '',
            f'{item.quantity:,.0f}',
            f'{item.unit_price:,.2f}',
            f'{item.total_price:,.2f}',
            f'{inr_val:,.2f}' if ci.exchange_rate else '-',
        ])

    it = Table(data, colWidths=CW)
    it.setStyle(TableStyle([
        # Header styling
        ('BACKGROUND', (0,0), (-1,0), G),
        ('TEXTCOLOR', (0,0), (-1,0), W),
        # Body styling — regular weight, clean
        ('FONT', (0,1), (-1,-1), _br),
        ('FONTSIZE', (0,1), (-1,-1), 8),
        # Alignment: left for text cols, center for HSN/Qty, right for numbers
        ('ALIGN', (0,1), (2,-1), 'LEFT'),
        ('ALIGN', (3,1), (4,-1), 'CENTER'),
        ('ALIGN', (5,1), (-1,-1), 'RIGHT'),
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

    # ═══ TOTALS SECTION (dual currency) ═══
    ts_g = ParagraphStyle('tsg', fontSize=8, textColor=G, fontName='Helvetica-Bold', alignment=2)
    ts_r = ParagraphStyle('tsr', fontSize=8, fontName=_br, alignment=2)

    total_rows = [
        ['', '', '', '', '', 'Total FOB', f'{ci.total_fob_usd:,.2f}', f'{ci.total_fob_inr:,.2f}' if ci.total_fob_inr else '-'],
        ['', '', '', '', '', 'Freight', f'{ci.freight:,.2f}', f'{ci.freight_inr:,.2f}' if ci.freight_inr else '-'],
        ['', '', '', '', '', 'Insurance', f'{ci.insurance:,.2f}', f'{ci.insurance_inr:,.2f}' if ci.insurance_inr else '-'],
        ['', '', '', '', '', Paragraph('<b>Total Invoice</b>', ts_g), Paragraph(f'<b>{ci.total_invoice_usd:,.2f}</b>', ts_g), Paragraph(f'<b>{ci.total_invoice_inr:,.2f}</b>' if ci.total_invoice_inr else '-', ts_g)],
    ]
    tot = Table(total_rows, colWidths=CW)
    tot.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'RIGHT'),
        ('FONTSIZE', (0,0), (-1,-1), 7),
        ('FONT', (0,0), (-1,-1), _br),
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
        ('RIGHTPADDING', (0,0), (-1,-1), 2),
        ('LINEABOVE', (5,0), (-1,0), 0.5, GR),
        ('LINEBELOW', (5,-1), (-1,-1), 0.5, GR),
    ]))
    el.append(tot)

    # ═══ IGST + GRAND TOTAL (INR only) ═══
    if ci.igst_rate:
        igst_rows = [
            ['', '', '', '', '', f'IGST @ {ci.igst_rate}%', '', f'{ci.igst_amount:,.2f}'],
            ['', '', '', '', '', Paragraph('<b>Grand Total (INR)</b>', ts_g), '', Paragraph(f'<b>{ci.grand_total_inr:,.2f}</b>', ts_g)],
        ]
        igst_t = Table(igst_rows, colWidths=CW)
        igst_t.setStyle(TableStyle([
            ('ALIGN', (0,0), (-1,-1), 'RIGHT'),
            ('FONTSIZE', (0,0), (-1,-1), 7),
            ('FONT', (0,0), (-1,-1), _br),
            ('TOPPADDING', (0,0), (-1,-1), 2),
            ('BOTTOMPADDING', (0,0), (-1,-1), 2),
            ('RIGHTPADDING', (0,0), (-1,-1), 2),
            ('LINEBELOW', (5,-1), (-1,-1), 0.8, G),
        ]))
        el.append(igst_t)

    # ═══ Amount Chargeable strip ═══
    TW = sum(CW)
    ac_style = ParagraphStyle('ac', fontSize=9, fontName=_bf, alignment=1)
    ac = Table([[Paragraph(f'Amount Chargeable : {ci.amount_in_words}', ac_style)]], colWidths=[TW])
    ac.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#dce9d0')),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    el.append(Spacer(1, 2*mm))
    el.append(ac)
    el.append(Spacer(1, 6*mm))

    # ═══ BANK DETAILS + SEAL/SIGN ═══
    bk_lb = ParagraphStyle('bklb', parent=styles['Normal'], fontSize=7, leading=9, fontName=_bf)
    bk_vl = ParagraphStyle('bkvl', parent=styles['Normal'], fontSize=7, leading=9, fontName=_br)
    bk_hd = ParagraphStyle('bkhd', parent=styles['Normal'], fontSize=8, leading=10, fontName=_bf)

    bank_lines = ci.bank_details.strip().split('\n')
    bank_rows = []
    for line in bank_lines:
        if ':' in line:
            label, value = line.split(':', 1)
            bank_rows.append([Paragraph(label.strip(), bk_lb), Paragraph(f': {value.strip()}', bk_vl)])
        else:
            bank_rows.append([Paragraph(line.strip(), bk_lb), ''])

    bank_table = Table(
        [[Paragraph('Bank Details', bk_hd), '']] + bank_rows,
        colWidths=[26*mm, 60*mm]
    )
    bank_table.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 1),
        ('BOTTOMPADDING', (0,0), (-1,-1), 1),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('SPAN', (0,0), (1,0)),
    ]))

    seal = Image(seal_path, width=20*mm, height=20*mm) if os.path.exists(seal_path) else ''
    sign = Image(sign_path, width=22*mm, height=11*mm) if os.path.exists(sign_path) else ''

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

    bank_row = Table([[bank_table, right_block]], colWidths=[TW - 72*mm, 72*mm])
    bank_row.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (0,0), 0),
        ('RIGHTPADDING', (0,0), (0,0), 0),
    ]))
    el.append(bank_row)
    el.append(Spacer(1, 4*mm))

    # ═══ DECLARATION ═══
    el.append(Paragraph(
        '<b>Declaration :</b> We declare that this Invoice shows the Actual Price of the Goods '
        'described and that all particulars are true and correct &nbsp;<b>E. &amp; O.E</b>',
        ParagraphStyle('d', fontSize=7, alignment=1)))
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

    contact = ci.client.contacts.filter(is_deleted=False).order_by('-is_primary').first()
    if not contact or not contact.email:
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
        email_account=email_account, to=contact.email,
        subject=subject, body_html=body_html,
        attachments=[pdf_file],
    )

    ci.status = 'sent'
    ci.save(update_fields=['status'])

    Communication.objects.create(
        client=ci.client, contact=contact, user=user,
        comm_type='email', direction='outbound',
        subject=subject, body=body_html, status='sent',
        email_account=email_account, external_email=contact.email,
    )

    return contact.email


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
