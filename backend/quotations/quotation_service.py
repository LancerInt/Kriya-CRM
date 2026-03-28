"""
Quotation PDF Service — generates PDF matching the Kriya Biosys Quotation template.
Layout: Logo + QUOTATION title | Exporter/Consignee | Shipment Details sidebar |
        Packing table | Total | Terms + Seal/Sign | Footer strip.
"""
import io
import os
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import (SimpleDocTemplate, Table, TableStyle, Paragraph,
                                 Spacer, Image, Flowable)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from django.conf import settings

# ── Company Constants ──
EXPORTER = {
    'name': 'KRIYA BIOSYS PRIVATE LIMITED',
    'lines': [
        'Aarthi Nagar, Mohan Nagar,',
        'Narasothipatti, Tamilnadu',
        'Salem - 636004',
    ],
    'contact': '+91 6385845466',
    'email': 'info@kriya.ltd',
}


def generate_quotation_pdf(q):
    """Generate PDF matching the Kriya Biosys Quotation template."""
    buffer = io.BytesIO()
    client_name = q.client.company_name if q.client else 'Client'
    pdf_title = f'Quotation {q.quotation_number} - {client_name}'
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=12*mm, bottomMargin=10*mm,
                            leftMargin=10*mm, rightMargin=10*mm,
                            title=pdf_title, author='Kriya Biosys Private Limited')
    styles = getSampleStyleSheet()
    el = []

    G = colors.HexColor('#558b2f')
    LG = colors.HexColor('#8ab56b')
    GR = colors.HexColor('#cccccc')
    W = colors.white
    B = colors.black
    NAVY = colors.HexColor('#1a3a5c')
    MDG = colors.HexColor('#d5d5d5')
    VLG = colors.HexColor('#f0f0f0')

    img_dir = os.path.join(settings.BASE_DIR, 'static', 'images')
    logo_path = os.path.join(img_dir, 'logo.png')
    seal_path = os.path.join(img_dir, 'seal.png')
    sign_path = os.path.join(img_dir, 'sign.png')

    # ── Rotated sidebar ──
    class RotatedText(Flowable):
        def __init__(self, text, w, h, bg, fs=7, font='Helvetica-Bold'):
            Flowable.__init__(self)
            self.text = text; self.width = w; self.height = h
            self.bg = bg; self.fs = fs; self.font = font
        def draw(self):
            c = self.canv; c.saveState()
            c.setFillColor(self.bg); c.rect(0, 0, self.width, self.height, fill=1, stroke=0)
            c.setFillColor(W); c.setFont(self.font, self.fs)
            c.translate(self.width/2, self.height/2); c.rotate(90)
            c.drawCentredString(0, -self.fs/3, self.text); c.restoreState()

    PW = 190*mm

    # Register fonts
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    _tf = 'Helvetica-Bold'  # title font (DistinctStyleSans)
    _bf = 'Helvetica-Bold'
    _br = 'Helvetica'
    try:
        # Bookman Old Style (the classic Windows serif font)
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

    # Styles — Bookman Old Style, font size 10
    FS = 10
    s8 = ParagraphStyle('s8', parent=styles['Normal'], fontSize=10, leading=12, fontName=_br)
    s7 = ParagraphStyle('s7', parent=styles['Normal'], fontSize=8, leading=10, fontName=_br)
    s8b = ParagraphStyle('s8b', parent=styles['Normal'], fontSize=10, leading=12, fontName=_bf)
    lb = ParagraphStyle('lb', parent=styles['Normal'], fontSize=10, leading=13, fontName=_bf, textColor=NAVY)
    vl = ParagraphStyle('vl', parent=styles['Normal'], fontSize=10, leading=13, fontName=_br)

    # ── Shared layout widths ──
    RW = 50*mm   # right panel
    GAP = 3*mm
    EW = 70*mm   # exporter column (wide enough for KRIYA BIOSYS PRIVATE LIMITED)
    CW2 = PW - EW - GAP - RW  # consignee column

    # ═══ ROW 1: Logo + QUOTATION title ═══
    logo = Image(logo_path, width=38*mm, height=23*mm) if os.path.exists(logo_path) else ''
    # Register Montserrat Regular for title
    mont_reg_path = os.path.join(img_dir, 'Montserrat-Regular.ttf')
    _mt = 'Helvetica'
    try:
        if os.path.exists(mont_reg_path):
            pdfmetrics.registerFont(TTFont('Montserrat-Regular', mont_reg_path))
            _mt = 'Montserrat-Regular'
    except Exception:
        pass
    title_p = Paragraph('QUOTATION', ParagraphStyle('ti', fontSize=18, textColor=W,
                         fontName=_mt, alignment=1, leading=20))
    title_box = Table([[title_p]], colWidths=[RW], rowHeights=[23*mm])
    title_box.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), G),
        ('VALIGN', (0,0), (-1,-1), 'BOTTOM'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
    ]))
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
    el.append(Spacer(1, 0))

    # ═══ ROW 2: Exporter | Consignee | Quote Number + Date ═══
    # Right column: Quote Number + Date
    q_date = q.created_at.strftime('%d/%m/%Y') if q.created_at else ''
    right_rows = [
        [Paragraph('<b>Quote Number</b>', ParagraphStyle('qn', fontSize=FS, fontName=_bf, alignment=1))],
        [Paragraph(f'{q.quotation_number}', ParagraphStyle('qv', fontSize=FS, fontName=_br, alignment=1))],
        [Paragraph('<b>Date</b>', ParagraphStyle('dl', fontSize=FS, fontName=_bf, alignment=1))],
        [Paragraph(f'{q_date}', ParagraphStyle('dv', fontSize=FS, fontName=_br, alignment=1))],
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

    # Client info
    client = q.client
    client_name = client.company_name if client else ''
    client_contact = client.contacts.filter(is_deleted=False).order_by('-is_primary').first() if client else None
    client_addr = client.address or '' if client else ''
    client_postal = f'{client.postal_code}' if client and client.postal_code else ''
    client_city = ', '.join(filter(None, [
        client.city if client else '',
        client.state if client else '',
    ]))
    client_country = client.country or '' if client else ''
    client_phone = f'Phone: {client_contact.phone or client.phone_number}' if client_contact and (client_contact.phone or client.phone_number) else ''

    rows = [
        [Paragraph('Exporter', ParagraphStyle('exp', fontSize=FS, leading=FS+2, fontName=_bf, textColor=colors.HexColor('#404040'), alignment=0)), Paragraph('Consignee', ParagraphStyle('con', fontSize=FS, leading=FS+2, fontName=_bf, textColor=colors.HexColor('#404040'), alignment=0)), '', rc],
        [Paragraph(EXPORTER['name'], ParagraphStyle('cn', fontSize=8, leading=10, fontName=_bf)), Paragraph(client_name, s8b), '', ''],
        [Paragraph(EXPORTER['lines'][0], s7), Paragraph(client_addr, s7), '', ''],
        [Paragraph(EXPORTER['lines'][1], s7), Paragraph(f'{client_postal} {client_city}', s7), '', ''],
        [Paragraph(EXPORTER['lines'][2], s7), Paragraph(client_country, s7), '', ''],
        [Paragraph(f'Contact : {EXPORTER["contact"]}', s7), Paragraph(client_phone, s7), '', ''],
        [Paragraph(f'Email : {EXPORTER["email"]}', s7), Paragraph('', s7), '', ''],
    ]
    t1 = Table(rows, colWidths=[EW, CW2, GAP, RW], rowHeights=[7*mm]+[None]*6)
    t1.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (1,0), MDG),
        ('BACKGROUND', (2,0), (2,0), W),
        ('BACKGROUND', (3,0), (3,0), W),
        ('LINEBELOW', (0,0), (1,0), 0.3, GR),
        ('VALIGN', (0,0), (1,0), 'MIDDLE'),
        ('SPAN', (3,0), (3,6)),
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
    el.append(Spacer(1, 4*mm))

    # ═══ SHIPMENT DETAILS ═══
    payment_display = q.payment_terms_detail or (q.get_payment_terms_display() if q.payment_terms else '')
    delivery_display = q.get_delivery_terms_display() if q.delivery_terms else ''

    sd = [
        [Paragraph('<b>Country of Origin</b>', lb), Paragraph(q.country_of_origin or 'India', vl),
         Paragraph('<b>Country of Final Destination</b>', lb), Paragraph(q.country_of_final_destination or '', vl)],
        [Paragraph('<b>Port of Loading</b>', lb), Paragraph(q.port_of_loading or '', vl),
         Paragraph('<b>Port of Discharge</b>', lb), Paragraph(q.port_of_discharge or '', vl)],
        [Paragraph('<b>Vessel / Flight No</b>', lb), Paragraph(q.vessel_flight_no or '', vl),
         Paragraph('<b>Final Destination</b>', lb), Paragraph(q.final_destination or '', vl)],
        [Paragraph('<b>Terms of Trade</b>', lb), Paragraph(payment_display, vl),
         Paragraph('<b>Terms of Delivery</b>', lb), Paragraph(delivery_display, vl)],
    ]
    _sw = PW - 8*mm  # 182mm
    # Label1(40) + Value1(35) + Label2(62) + Value2(45) = 182mm
    _rh = 10*mm  # fixed row height for shipment rows
    st = Table(sd, colWidths=[40*mm, 35*mm, 62*mm, _sw - 40*mm - 35*mm - 62*mm],
               rowHeights=[_rh]*4)
    st.setStyle(TableStyle([
        ('FONTSIZE', (0,0), (-1,-1), FS),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
        ('LEFTPADDING', (0,0), (-1,-1), 4),
    ]))
    sidebar = RotatedText('SHIPMENT  DETAILS', 8*mm, 4*_rh, G, 8, _mt)
    sw = Table([[sidebar, st]], colWidths=[8*mm, PW - 8*mm])
    sw.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('RIGHTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
    ]))
    el.append(sw)
    el.append(Spacer(1, 1*mm))

    # ═══ PACKING DETAILS ═══
    # Product(40) Details(55) Quantity(25) Price(35) Amount(35) = 190mm
    TCW = [40*mm, 55*mm, 25*mm, 35*mm, 35*mm]

    # Register Arial Regular for PACKING DETAILS title
    arial_path = os.path.join(img_dir, 'Arial-Regular.ttf')
    _ar = _br
    try:
        if os.path.exists(arial_path):
            pdfmetrics.registerFont(TTFont('Arial-Regular', arial_path))
            _ar = 'Arial-Regular'
    except Exception:
        pass
    pd_title = Table([[Paragraph('PACKING DETAILS', ParagraphStyle('pd', fontSize=18,
                       textColor=colors.HexColor('#aaaaaa'), alignment=2, fontName=_ar))]], colWidths=[sum(TCW)])
    el.append(pd_title)
    el.append(Spacer(1, 2*mm))

    # Header
    hs = ParagraphStyle('hs', fontSize=10, fontName=_bf, textColor=W, leading=12)
    hsr = ParagraphStyle('hsr', fontSize=10, fontName=_bf, textColor=W, leading=12, alignment=2)
    hsc = ParagraphStyle('hsc', fontSize=10, fontName=_bf, textColor=W, leading=12, alignment=1)
    hdr = [
        Paragraph('Product Name', hs),
        Paragraph('Product Details', hs),
        Paragraph('Quantity', hsc),
        Paragraph('Price', hsr),
        Paragraph('Amount', hsr),
    ]

    prefix = '$ ' if q.currency == 'USD' else ''
    data = [hdr]
    for item in q.items.all():
        qty = float(item.quantity) if item.quantity else 0
        price = float(item.unit_price) if item.unit_price else 0
        amount = qty * price if qty and price else 0

        data.append([
            item.product_name,
            item.description or '',
            f'{qty:,.0f} {item.unit}' if qty else '-.--',
            f'{prefix}{price:,.2f}' if price else '-.--',
            f'{prefix}{amount:,.2f}' if amount else '-.--',
        ])

    it = Table(data, colWidths=TCW)
    it.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), G),
        ('TEXTCOLOR', (0,0), (-1,0), W),
        ('FONT', (0,1), (-1,-1), _br),
        ('FONTSIZE', (0,1), (-1,-1), 10),
        ('ALIGN', (0,0), (1,-1), 'LEFT'),
        ('ALIGN', (2,1), (2,-1), 'CENTER'),
        ('ALIGN', (3,0), (-1,-1), 'RIGHT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,0), 5),
        ('BOTTOMPADDING', (0,0), (-1,0), 5),
        ('TOPPADDING', (0,1), (-1,-1), 6),
        ('BOTTOMPADDING', (0,1), (-1,-1), 6),
        ('LEFTPADDING', (0,0), (-1,-1), 5),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    el.append(it)
    el.append(Spacer(1, 2*mm))

    # ═══ TOTAL ═══
    ts_g = ParagraphStyle('tsg', fontSize=FS, textColor=G, fontName=_bf, alignment=2)
    amounts = [float(i.quantity or 0) * float(i.unit_price or 0) for i in q.items.all()]
    valid_amounts = [a for a in amounts if a > 0]
    total_val = sum(valid_amounts) if valid_amounts else 0
    total_display = f'{prefix}{total_val:,.2f}' if total_val else '-.--'
    tot = Table([
        ['', '', '', Paragraph('<b>Total</b>', ts_g),
         Paragraph(f'<b>{total_display}</b>', ts_g)]
    ], colWidths=TCW)
    tot.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'RIGHT'),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
        ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    el.append(tot)
    el.append(Spacer(1, 6*mm))

    # ═══ TERMS + SEAL/SIGN ═══
    _fs_terms = FS - 2  # slightly smaller than body text
    terms_style = ParagraphStyle('ts', fontSize=_fs_terms, leading=_fs_terms+2, fontName=_br)
    terms_bold = ParagraphStyle('tb', fontSize=_fs_terms, leading=_fs_terms+2, fontName=_bf)

    terms_text = Paragraph(
        '<i>The Quotation is not a contract or a bill it is our best at the total price for the '
        'service and goods described above. The Customer will be billed after indicating '
        'acceptance of this quote. We will be happy to serve you with any further '
        'information you may need.</i>', terms_style)
    validity_text = Paragraph(f'This Quote is Valid for {q.validity_days} Days', terms_style)

    # Delivery note — use font tag for bold since <b> doesn't work with custom TTF
    delivery_note = ''
    if q.freight_terms:
        delivery_note = f'<font name="{_bf}">Sail Start Date </font>: 15 Days from PO'

    delivery_p = Paragraph(delivery_note, terms_style) if delivery_note else Spacer(1, 1)

    left_block = Table([
        [terms_text],
        [Spacer(1, 3*mm)],
        [validity_text],
        [Spacer(1, 2*mm)],
        [delivery_p],
    ], colWidths=[100*mm])
    left_block.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 0),
        ('BOTTOMPADDING', (0,0), (-1,-1), 0),
    ]))

    # Right: seal + sign
    seal = Image(seal_path, width=20*mm, height=20*mm) if os.path.exists(seal_path) else ''
    sign = Image(sign_path, width=22*mm, height=11*mm) if os.path.exists(sign_path) else ''

    auth_top = Paragraph('<b>For Kriya Biosys Private Limited</b>',
                         ParagraphStyle('fk', fontSize=FS, alignment=1, fontName=_bf))
    seal_sign = Table([[seal, sign]], colWidths=[22*mm, 25*mm])
    seal_sign.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'BOTTOM'),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
    ]))
    auth_bottom = Paragraph('Authorised Signature',
                            ParagraphStyle('as3', fontSize=FS, alignment=1, fontName=_br))

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

    TW = sum(TCW)
    footer_row = Table([[left_block, right_block]], colWidths=[TW - 72*mm, 72*mm])
    footer_row.setStyle(TableStyle([
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (0,0), 0),
        ('RIGHTPADDING', (0,0), (0,0), 0),
    ]))
    el.append(footer_row)
    el.append(Spacer(1, 6*mm))

    # ═══ FOOTER STRIPS ═══
    fc = ParagraphStyle('fc', fontSize=FS, fontName=_bf, alignment=1)
    el.append(Paragraph('<b>Expecting Your Business !</b>', fc))
    el.append(Spacer(1, 2*mm))

    # Green email strip
    email_strip = Table([[Paragraph(
        f'If you have any questions please contact info@kriya.ltd',
        ParagraphStyle('es', fontSize=FS, fontName=_br, textColor=W, alignment=1)
    )]], colWidths=[TW])
    email_strip.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), G),
        ('TOPPADDING', (0,0), (-1,-1), 3),
        ('BOTTOMPADDING', (0,0), (-1,-1), 3),
    ]))
    el.append(email_strip)
    el.append(Spacer(1, 3*mm))

    el.append(Paragraph('" Go Organic ! Save Planet ! "',
                        ParagraphStyle('m', fontSize=FS, alignment=1, fontName=_bf)))

    doc.build(el)
    buffer.seek(0)
    return buffer
