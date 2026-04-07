"""
Proforma Invoice Service — auto-fill from client/order, PDF generation, email sending.
Matches the exact Kriya Biosys PI template layout.
"""
import io
import logging
from datetime import date
from django.utils import timezone

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


def create_pi_from_order(order, user):
    """Create a ProformaInvoice from an Order, auto-filling client data."""
    from finance.models import ProformaInvoice, ProformaInvoiceItem

    client = order.client

    # Generate invoice number
    count = ProformaInvoice.objects.count() + 1
    today = date.today()
    invoice_number = f'{today.strftime("%y-%m")}/KB-{count:03d}'

    # Auto-fill client fields
    pi = ProformaInvoice.objects.create(
        order=order,
        client=client,
        invoice_number=invoice_number,
        invoice_date=today,
        created_by=user,

        # Client section
        client_company_name=client.company_name,
        client_tax_number=client.tax_number or '',
        client_address=client.address or '',
        client_pincode=client.postal_code or '',
        client_city_state_country=f'{client.city}, {client.state}, {client.country}'.strip(', '),
        client_phone=client.phone_number or '',

        # Shipment defaults
        country_of_origin='India',
        country_of_final_destination=client.country or '',
        terms_of_trade=order.payment_terms or '',
        terms_of_delivery=f'{order.delivery_terms} - Chennai / Tuticorin Port' if order.delivery_terms else '',
        buyer_reference=f'PO No: {order.po_number}' if order.po_number else '',

        # Totals
        currency=order.currency,
        total=order.total,
        amount_in_words=_number_to_words(float(order.total), order.currency),

        bank_details=DEFAULT_BANK,
    )

    # Copy items from order
    # PI: product_name = client brand name from Product master
    #     description_of_goods = company product name from Product master
    for item in order.items.all():
        pi_product_name = item.client_product_name or item.product_name
        pi_description = item.product_name

        # If product FK exists, pull client_brand_names from Product master
        if item.product and item.product.client_brand_names:
            brand_names = [b.strip() for b in item.product.client_brand_names.split(',') if b.strip()]
            if brand_names:
                pi_product_name = brand_names[0]  # First brand name
            pi_description = str(item.product)  # Company product name with concentration

        ProformaInvoiceItem.objects.create(
            pi=pi,
            product_name=pi_product_name,
            client_product_name=item.client_product_name,
            packages_description=f'{int(item.quantity)} {item.unit} Container Packing',
            description_of_goods=pi_description,
            quantity=item.quantity,
            unit=item.unit,
            unit_price=item.unit_price,
            total_price=item.total_price,
        )

    return pi


def generate_pi_pdf(pi):
    """Generate PDF matching the exact Kriya Biosys PI template."""
    import os
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image, Flowable
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from django.conf import settings

    buffer = io.BytesIO()
    pdf_title = f'PI {pi.invoice_number} - {pi.client_company_name}'
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=12*mm, bottomMargin=10*mm,
                            leftMargin=10*mm, rightMargin=10*mm,
                            title=pdf_title, author='Kriya Biosys Private Limited')
    styles = getSampleStyleSheet()
    el = []

    G = colors.HexColor('#558b2f')  # Kriya green
    LG = colors.HexColor('#8ab56b')  # lighter green for accent
    GR = colors.HexColor('#cccccc')  # grid grey
    W = colors.white
    B = colors.black

    img_dir = os.path.join(settings.BASE_DIR, 'static', 'images')
    logo_path = os.path.join(img_dir, 'logo.png')
    seal_path = os.path.join(img_dir, 'seal.png')
    sign_path = os.path.join(img_dir, 'sign.png')

    # Styles defined after font registration below
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

    # ═══ Shared widths — all sections use PW (190mm) total ═══
    _RW = 50*mm; _EW = 50*mm; _CW2 = 60*mm; _GAP = PW - _EW - _CW2 - _RW

    # ═══ ROW 1: Logo left + Green PROFORMA INVOICE box right ═══
    logo = Image(logo_path, width=38*mm, height=23*mm) if os.path.exists(logo_path) else ''
    # Register fonts — Bookman Old Style (classic Windows serif)
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    _bf = 'Helvetica-Bold'
    _br = 'Helvetica'
    _mt = 'Helvetica'  # Montserrat Regular for titles
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

    # Styles using registered fonts
    s8 = ParagraphStyle('s8', parent=styles['Normal'], fontSize=8, leading=10, fontName=_br)
    s7 = ParagraphStyle('s7', parent=styles['Normal'], fontSize=7, leading=9, fontName=_br)
    s8b = ParagraphStyle('s8b', parent=styles['Normal'], fontSize=8, leading=10, fontName=_bf)

    title_p = Paragraph('PROFORMA<br/>INVOICE', ParagraphStyle('ti', fontSize=14, textColor=W, fontName=_mt, alignment=1, leading=24))
    title_box = Table([[title_p]], colWidths=[_RW], rowHeights=[23*mm])
    title_box.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,-1),G),
        ('VALIGN',(0,0),(-1,-1),'BOTTOM'),
        ('LEFTPADDING',(0,0),(-1,-1), 0),
        ('RIGHTPADDING',(0,0),(-1,-1), 0),
        ('BOTTOMPADDING',(0,0),(-1,-1), 2),
    ]))

    h0 = Table([[logo, '', '', title_box]], colWidths=[_EW, _CW2, _GAP, _RW])
    h0.setStyle(TableStyle([
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('SPAN',(0,0),(1,0)),
        ('LEFTPADDING',(3,0),(3,0), 0),
        ('RIGHTPADDING',(3,0),(3,0), 0),
        ('TOPPADDING',(3,0),(3,0), 0),
        ('BOTTOMPADDING',(3,0),(3,0), 0),
    ]))
    el.append(h0); el.append(Spacer(1, 0))

    # ═══ ROW 2: EXPORTER | CONSIGNEE | PI Number + Date (aligned at same line) ═══
    LGR = colors.HexColor('#e8e8e8')
    MGR = colors.HexColor('#d0d0d0')

    # Right column: PRO. Invoice Number + Date (NO green box — that's above now)
    right_rows = [
        [Paragraph('<b>PRO. Invoice Number</b>', ParagraphStyle('pn', fontSize=10, fontName=_bf, alignment=1))],
        [Paragraph(f'{pi.invoice_number}', ParagraphStyle('pv', fontSize=10, fontName=_br, alignment=1))],
        [Paragraph('<b>Date</b>', ParagraphStyle('dl', fontSize=10, fontName=_bf, alignment=1))],
        [Paragraph(f'{pi.invoice_date.strftime("%d-%m-%Y")}', ParagraphStyle('dv', fontSize=10, fontName=_br, alignment=1))],
    ]
    rc = Table(right_rows, colWidths=[50*mm], rowHeights=[7*mm, 7*mm, 7*mm, 7*mm])
    DKG = colors.HexColor('#c0c0c0')   # Darker gray for PRO. Invoice Number
    MDG = colors.HexColor('#d5d5d5')   # Medium gray for Date
    VLG = colors.HexColor('#f0f0f0')   # Very light gray for values

    rc.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (0,0), MDG),   # Same gray as Date - PRO. Invoice Number
        ('BACKGROUND', (0,1), (0,1), VLG),   # Very light gray - value
        ('BACKGROUND', (0,2), (0,2), MDG),   # Medium gray - Date
        ('BACKGROUND', (0,3), (0,3), VLG),   # Very light gray - value
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('ALIGN', (0,0), (-1,-1), 'CENTER'),
        # NO borders, NO lines
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
    ]))

    # Exporter + Consignee rows — 4 columns: Exporter | Consignee | GAP | Right Panel
    RW = 50*mm  # Right panel width (same as green box above)
    GAP = 3*mm  # Gap between content and right panel
    EW = 60*mm  # Exporter width
    CW2 = PW - EW - GAP - RW  # Consignee width (fills remaining)

    rows = [
        [Paragraph('Exporter',s8b), Paragraph('Consignee',s8b), '', rc],
        [Paragraph(EXPORTER["name"],s8b), Paragraph(pi.client_company_name,s8b), '', ''],
        [Paragraph('D.no : 233, Aarthi Nagar,',s7), Paragraph(f'{pi.client_tax_number}',s7), '', ''],
        [Paragraph('Mohan Nagar, Narasothipatti,',s7), Paragraph(f'{pi.client_address}',s7), '', ''],
        [Paragraph('Salem - 636004, Tamilnadu',s7), Paragraph(f'{pi.client_pincode}',s7), '', ''],
        [Paragraph(f'GSTIN : {EXPORTER["gstin"]}',s7), Paragraph(f'{pi.client_city_state_country}',s7), '', ''],
        [Paragraph(f'EMAIL : {EXPORTER["email"]}',s7), Paragraph(f'Tel: {pi.client_phone}',s7), '', ''],
        [Paragraph(f'IEC : {EXPORTER["iec"]}',s7), '', '', ''],
    ]
    t1 = Table(rows, colWidths=[EW, CW2, GAP, RW], rowHeights=[7*mm]+[None]*7)
    t1.setStyle(TableStyle([
        # Gray strip ONLY on columns 0-1, NOT gap (col 2) or right panel (col 3)
        ('BACKGROUND', (0,0), (1,0), colors.HexColor('#d5d5d5')),
        ('BACKGROUND', (2,0), (2,0), W),  # Gap column white
        ('BACKGROUND', (3,0), (3,0), W),  # Right panel white (it has its own bg)
        ('LINEBELOW', (0,0), (1,0), 0.3, GR),
        # Header row: vertically center text
        ('VALIGN', (0,0), (1,0), 'MIDDLE'),
        # Right panel spans all rows
        ('SPAN', (3,0), (3,7)),
        ('VALIGN', (0,1), (-1,-1), 'TOP'),
        ('VALIGN', (3,0), (3,0), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 1),
        ('BOTTOMPADDING', (0,0), (-1,-1), 1),
        # Zero left padding on exporter+consignee so content aligns with header
        ('LEFTPADDING', (0,0), (1,-1), 3),
        # No padding on right panel column
        ('LEFTPADDING', (3,0), (3,0), 0),
        ('RIGHTPADDING', (3,0), (3,0), 0),
        ('TOPPADDING', (3,0), (3,0), 0),
        ('BOTTOMPADDING', (3,0), (3,0), 0),
        # No padding on gap column
        ('LEFTPADDING', (2,0), (2,-1), 0),
        ('RIGHTPADDING', (2,0), (2,-1), 0),
    ]))
    el.append(t1); el.append(Spacer(1, 0))

    # ── SHIPMENT DETAILS: Bookman labels (blue), Bookman values, Montserrat sidebar ──
    NAVY = colors.HexColor('#1a3a5c')
    lb = ParagraphStyle('lb', parent=styles['Normal'], fontSize=8, leading=11, fontName=_bf, textColor=NAVY)
    vl = ParagraphStyle('vl', parent=styles['Normal'], fontSize=8, leading=11, fontName=_br)

    sd = [
        [Paragraph('<b>Country of Origin</b>',lb), Paragraph(pi.country_of_origin,vl),
         Paragraph('<b>Country of Final Destination</b>',lb), Paragraph(pi.country_of_final_destination,vl)],
        [Paragraph('<b>Port of Loading</b>',lb), Paragraph(pi.port_of_loading or '',vl),
         Paragraph('<b>Port of Discharge</b>',lb), Paragraph(pi.port_of_discharge or '',vl)],
        [Paragraph('<b>Vessel / Flight No</b>',lb), Paragraph(pi.vessel_flight_no or '',vl),
         Paragraph('<b>Final Destination</b>',lb), Paragraph(pi.final_destination or '',vl)],
        [Paragraph('<b>Terms of Trade</b>',lb), Paragraph(pi.terms_of_trade or '',vl),
         Paragraph('<b>Terms of Delivery</b>',lb), Paragraph(pi.terms_of_delivery or '',vl)],
        [Paragraph('<b>Buyer Reference</b>',lb), Paragraph(pi.buyer_reference or '',vl), '', ''],
    ]
    _sw = PW - 11*mm  # shipment content width = 180mm
    # Label1(32) + Value1(38) + Label2(50) + Value2(62) = 182mm
    _rh = 8*mm  # fixed row height
    st = Table(sd, colWidths=[32*mm, 38*mm, 50*mm, _sw - 32*mm - 38*mm - 50*mm],
               rowHeights=[_rh]*5)
    st.setStyle(TableStyle([
        ('FONTSIZE',(0,0),(-1,-1), 8),
        ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ('TOPPADDING',(0,0),(-1,-1), 2),
        ('BOTTOMPADDING',(0,0),(-1,-1), 2),
        ('LEFTPADDING',(0,0),(-1,-1), 4),
    ]))
    sidebar = RotatedText('SHIPMENT  DETAILS', 12*mm, 5*_rh, G, 9, _mt)
    sw = Table([[sidebar, st]], colWidths=[12*mm, PW - 12*mm])
    sw.setStyle(TableStyle([
        ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ('LEFTPADDING',(0,0),(-1,-1),0),
        ('RIGHTPADDING',(0,0),(-1,-1),0),
        ('TOPPADDING',(0,0),(-1,-1),0),
        ('BOTTOMPADDING',(0,0),(-1,-1),0),
    ]))
    el.append(sw); el.append(Spacer(1, 1*mm))

    # Column widths: must be consistent across header, body, total, and title
    CW = [30*mm, 40*mm, 46*mm, 20*mm, 24*mm, 30*mm]  # total = 190mm = PW

    # ── PACKING DETAILS: right-aligned, same width as table below ──
    _cf = 'Comfortaa-Bold' if 'Comfortaa-Bold' in pdfmetrics.getRegisteredFontNames() else 'Helvetica'
    pd_title = Table([[Paragraph('PACKING DETAILS', ParagraphStyle('pd', fontSize=16, textColor=colors.HexColor('#aaaaaa'), alignment=2, fontName=_cf))]], colWidths=[sum(CW)])
    el.append(pd_title)
    el.append(Spacer(1, 1*mm))

    hdr = ['Product Details', 'No. & Kind of Packages', 'Description of Goods', 'Quantity', 'Price/Ltr', 'Amount']
    data = [hdr]
    # Wrap text columns in Paragraph so long content wraps to the next line
    # instead of overflowing. Whitespace (multiple spaces, tabs) and explicit
    # line breaks (Shift+Enter / Enter from the editor) are all preserved by
    # converting them to non-breaking spaces and <br/> markers — ReportLab's
    # Paragraph collapses whitespace by default, so we substitute beforehand.
    import html as _html
    import re as _re
    _cell_style = ParagraphStyle('pi_cell', fontSize=7, leading=9, fontName=_br)

    def _wrap(text):
        if not text:
            return Paragraph('', _cell_style)
        s = _html.escape(text)
        # Preserve tabs as 4 non-breaking spaces
        s = s.replace('\t', '&nbsp;&nbsp;&nbsp;&nbsp;')
        # Preserve runs of multiple spaces (single space stays normal so word
        # wrapping still works for ordinary text)
        s = _re.sub(r' {2,}', lambda m: '&nbsp;' * len(m.group(0)), s)
        # Preserve line breaks
        s = s.replace('\r\n', '\n').replace('\n', '<br/>')
        return Paragraph(s, _cell_style)

    for item in pi.items.all():
        data.append([
            _wrap(item.product_name),
            _wrap(item.packages_description),
            _wrap(item.description_of_goods),
            f'{item.quantity:,.0f} {item.unit}'.strip(),
            f'{item.unit_price:,.2f}',
            f'{item.total_price:,.2f}',
        ])

    it = Table(data, colWidths=CW)
    it.setStyle(TableStyle([
        ('BACKGROUND',(0,0),(-1,0), G),
        ('TEXTCOLOR',(0,0),(-1,0), W),
        ('FONT',(0,0),(-1,0), _bf),
        ('FONTSIZE',(0,0),(-1,0), 7),            # header size
        ('FONT',(0,1),(-1,-1), _br),             # body font: Bookman Regular
        ('FONTSIZE',(0,1),(-1,-1), 7),            # body size
        # Left-align first 3 columns (text), right-align last 3 (numbers)
        ('ALIGN',(0,0),(2,-1),'LEFT'),
        ('ALIGN',(3,1),(3,-1),'CENTER'),   # Quantity body: center
        ('ALIGN',(4,0),(-1,-1),'RIGHT'),   # Price + Amount: right
        ('ALIGN',(3,0),(3,0),'CENTER'),    # Quantity header: center
        ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ('TOPPADDING',(0,0),(-1,-1), 4),
        ('BOTTOMPADDING',(0,0),(-1,-1), 4),
        ('LEFTPADDING',(0,0),(-1,-1), 3),
        ('RIGHTPADDING',(0,0),(-1,-1), 3),
    ]))
    el.append(it)

    # ── Totals: Freight, Insurance, Sub Total, Discount, Grand Total ──
    ov = pi.display_overrides if isinstance(pi.display_overrides, dict) else {}
    total_val = sum(float(i.total_price) for i in pi.items.all())
    freight = float(ov.get('_freight', 0) or 0)
    insurance = float(ov.get('_insurance', 0) or 0)
    sub_total = total_val + freight + insurance
    discount = float(ov.get('_discount', 0) or 0)
    discount_label = ov.get('_discount_label', '')
    grand_total = sub_total - discount
    prefix = '$' if pi.currency == 'USD' else ''

    ts_g = ParagraphStyle('tsg', fontSize=9, textColor=G, fontName=_bf, alignment=2)

    TW = sum(CW)
    _lw = TW - 60*mm  # left spacer
    totals_data = [
        ['', 'Freight', f'{prefix}{freight:,.2f}'],
        ['', 'Insurance', f'{prefix}{insurance:,.2f}'],
        ['', 'Sub Total', f'{prefix}{sub_total:,.2f}'],
    ]
    if discount:
        totals_data.append(['', f'Discount {discount_label}', f'{prefix}{discount:,.2f}'])
    totals_data.append(['', Paragraph('<b>Grand Total</b>', ts_g), Paragraph(f'<b>{prefix}{grand_total:,.2f}</b>', ts_g)])

    tot = Table(totals_data, colWidths=[_lw, 30*mm, 30*mm])
    tot.setStyle(TableStyle([
        ('ALIGN', (0,0), (-1,-1), 'RIGHT'),
        ('FONT', (0,0), (-1,-1), _bf),
        ('FONTSIZE', (0,0), (-1,-1), 8),
        ('TOPPADDING', (0,0), (-1,-1), 2),
        ('BOTTOMPADDING', (0,0), (-1,-1), 2),
        ('RIGHTPADDING', (0,0), (-1,-1), 3),
        ('LINEBELOW', (1,-1), (-1,-1), 0.5, G),
    ]))
    el.append(tot)
    el.append(Spacer(1, 3*mm))

    # ── Amount in Words strip ──
    ac_style = ParagraphStyle('ac', fontSize=9, fontName=_bf, alignment=1)
    ac = Table([[Paragraph(f'Amount In Words : {pi.amount_in_words or ""}', ac_style)]],
               colWidths=[TW])
    ac.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#dce9d0')),
        ('TOPPADDING', (0,0), (-1,-1), 4),
        ('BOTTOMPADDING', (0,0), (-1,-1), 4),
    ]))
    el.append(ac)
    el.append(Spacer(1, 6*mm))

    # ═══ BANK DETAILS (vertical list) + SEAL + SIGN (right side) ═══
    bk_lb = ParagraphStyle('bklb', parent=styles['Normal'], fontSize=7, leading=9, fontName=_bf)
    bk_vl = ParagraphStyle('bkvl', parent=styles['Normal'], fontSize=7, leading=9, fontName=_br)
    bk_hd = ParagraphStyle('bkhd', parent=styles['Normal'], fontSize=8, leading=10, fontName=_bf)

    bank_lines = pi.bank_details.strip().split('\n')
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
        ('SPAN', (0,0), (1,0)),  # "Bank Details" header spans both columns
    ]))
    bank_p = bank_table

    seal = Image(seal_path, width=20*mm, height=20*mm) if os.path.exists(seal_path) else ''
    sign = Image(sign_path, width=22*mm, height=11*mm) if os.path.exists(sign_path) else ''

    # Right side: "For Kriya..." → seal+sign side by side → "Authorised Signature"
    auth_top = Paragraph('<b>For Kriya Biosys Private Limited</b>',
                         ParagraphStyle('fk', fontSize=9, alignment=1, fontName=_bf))
    seal_sign = Table([[seal, sign]], colWidths=[22*mm, 25*mm])
    seal_sign.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'BOTTOM'), ('ALIGN',(0,0),(-1,-1),'CENTER')]))
    auth_bottom = Paragraph('Authorised Signature',
                            ParagraphStyle('as3', fontSize=9, alignment=1, fontName=_br))

    right_block = Table([
        [auth_top],
        [seal_sign],
        [auth_bottom],
    ], colWidths=[70*mm])
    right_block.setStyle(TableStyle([
        ('ALIGN',(0,0),(-1,-1),'CENTER'),
        ('VALIGN',(0,0),(-1,-1),'MIDDLE'),
        ('TOPPADDING',(0,0),(-1,-1), 2),
        ('BOTTOMPADDING',(0,0),(-1,-1), 2),
    ]))

    # Bank left, auth block right
    TW = sum(CW)
    bank_row = Table([[bank_p, right_block]], colWidths=[TW - 72*mm, 72*mm])
    bank_row.setStyle(TableStyle([
        ('VALIGN',(0,0),(-1,-1),'TOP'),
        ('LEFTPADDING',(0,0),(0,0), 0),
        ('RIGHTPADDING',(0,0),(0,0), 0),
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


def send_pi_email(pi, user):
    """Generate PDF, send to client, update status."""
    from communications.models import EmailAccount, Communication
    from communications.services import EmailService
    from django.core.files.base import ContentFile

    # Get contact email — reply to the requester if PI was auto-created from an email
    from communications.services import get_client_email_recipients
    contact_email, contact, cc_string = get_client_email_recipients(
        pi.client, source_communication=pi.source_communication
    )
    if not contact_email:
        raise ValueError(f'No email for {pi.client_company_name}')

    email_account = EmailAccount.objects.filter(is_active=True).first()
    if not email_account:
        raise ValueError('No email account configured')

    # Generate PDF
    pdf_buffer = generate_pi_pdf(pi)
    pdf_bytes = pdf_buffer.read()

    # Save PDF to model
    pi.pdf_file.save(f'{pi.invoice_number.replace("/", "-")}.pdf', ContentFile(pdf_bytes), save=True)

    # Build email
    subject = f'Proforma Invoice {pi.invoice_number} - Kriya Biosys'
    body_html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;">
        <h2 style="color:#4a7c2e;">Proforma Invoice</h2>
        <p>Dear {contact.name},</p>
        <p>Please find attached our Proforma Invoice <b>{pi.invoice_number}</b> dated {pi.invoice_date.strftime('%B %d, %Y')}.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <tr><td style="padding:6px;color:#666;">PI Number</td><td style="padding:6px;font-weight:bold;">{pi.invoice_number}</td></tr>
            <tr><td style="padding:6px;color:#666;">Total</td><td style="padding:6px;font-weight:bold;">{pi.currency} {pi.total:,.2f}</td></tr>
            <tr><td style="padding:6px;color:#666;">Terms</td><td style="padding:6px;">{pi.terms_of_trade}</td></tr>
        </table>
        <p>Please review and confirm. Looking forward to your response.</p>
        <p>Best regards,<br/><b>Kriya Biosys Private Limited</b><br/><i>"Go Organic! Save Planet!"</i></p>
    </div>
    """

    # Create file-like objects for attachment
    from io import BytesIO
    pdf_file = BytesIO(pdf_bytes)
    pdf_file.name = f'PI_{pi.invoice_number.replace("/", "-")}.pdf'

    EmailService.send_email(
        email_account=email_account, to=contact_email,
        subject=subject, body_html=body_html,
        attachments=[pdf_file],
        cc=cc_string or None,
    )

    # Update status
    pi.status = 'sent'
    pi.save(update_fields=['status'])

    # Log communication
    Communication.objects.create(
        client=pi.client, contact=contact, user=user,
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
