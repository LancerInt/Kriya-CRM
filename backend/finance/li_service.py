"""
Logistics Invoice Service — create, generate PDF, send email.
PDF template matches the Kriya Biosys Logistics Invoice reference design.
"""
import io
import logging
from datetime import date

logger = logging.getLogger(__name__)

EXPORTER = {
    "name": "KRIYA BIOSYS PRIVATE LIMITED",
    "addr1": "D.no : 233, Aarthi Nagar,",
    "addr2": "Mohan Nagar, Narasothipatti,",
    "addr3": "Salem - 636004, Tamilnadu",
    "contact": "+91 6385848466",
    "email": "info@kriya.ltd",
    "gstin": "33AAHCK9695F1Z3",
    "iec": "AAHCK9695F",
}


def create_li_from_order(order, user):
    """Create a LogisticsInvoice from an Order, auto-filling client data."""
    from .models import LogisticsInvoice, LogisticsInvoiceItem

    client = order.client
    count = LogisticsInvoice.objects.count() + 1
    today = date.today()
    invoice_number = f'EXP{today.strftime("%y")}/{today.year}-{today.strftime("%y")[-1:]}6'

    li = LogisticsInvoice.objects.create(
        order=order,
        client=client,
        invoice_number=invoice_number,
        invoice_date=today,
        created_by=user,
        client_company_name=client.company_name,
        client_tax_number=client.tax_number or '',
        client_address=client.address or '',
        client_pincode=getattr(client, 'postal_code', '') or '',
        client_city_state_country=f'{getattr(client, "city", "")}, {getattr(client, "state", "")}, {client.country}'.strip(', '),
        client_phone=client.phone_number or '',
        country_of_origin='India',
        country_of_final_destination=client.country or '',
        currency=order.currency or 'USD',
        port_of_loading=getattr(order, 'port_of_loading', '') or '',
        terms_of_delivery=order.delivery_terms or 'FOB',
        payment_terms=order.payment_terms or '',
    )

    # Copy items from order
    for item in order.items.all():
        LogisticsInvoiceItem.objects.create(
            li=li,
            product_name=item.product_name,
            packages_description='',
            description_of_goods='',
            quantity=item.quantity,
            unit=item.unit,
            unit_price=item.unit_price,
            amount_usd=item.total_price,
        )

    # Update total
    li.total_fob_usd = sum(float(i.amount_usd) for i in li.items.all())
    li.subtotal_usd = li.total_fob_usd
    li.save(update_fields=['total_fob_usd', 'subtotal_usd'])

    return li


def generate_li_pdf(li):
    """Generate PDF matching the Kriya Biosys Logistics Invoice template."""
    import os
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image, Flowable
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from django.conf import settings

    buffer = io.BytesIO()
    pdf_title = f'LI {li.invoice_number} - {li.client_company_name}'
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=6*mm, bottomMargin=6*mm,
                            leftMargin=10*mm, rightMargin=10*mm,
                            title=pdf_title, author='Kriya Biosys Private Limited')
    styles = getSampleStyleSheet()
    el = []

    G = colors.HexColor('#4F7F2A')
    LG = colors.HexColor('#8ab56b')
    GR = colors.HexColor('#cccccc')
    W = colors.white
    B = colors.black
    NAVY = colors.HexColor('#1a3a5c')

    img_dir = os.path.join(settings.BASE_DIR, 'static', 'images')
    logo_path = os.path.join(img_dir, 'logo.png')
    seal_path = os.path.join(img_dir, 'seal.png')
    sign_path = os.path.join(img_dir, 'sign.png')

    # Rotated sidebar
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

    PW = 190*mm

    # Register fonts
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont
    _bf = 'Helvetica-Bold'
    _br = 'Helvetica'
    _mt = 'Helvetica'
    _ar = 'Helvetica'
    try:
        for fname, ffile in [('BookmanOldStyle-Bold', 'BookmanOldStyle-Bold.ttf'),
                              ('BookmanOldStyle', 'BookmanOldStyle-Regular.ttf'),
                              ('Montserrat-Regular', 'Montserrat-Regular.ttf'),
                              ('Arial-Regular', 'Arial-Regular.ttf')]:
            fpath = os.path.join(img_dir, ffile)
            if os.path.exists(fpath):
                pdfmetrics.registerFont(TTFont(fname, fpath))
                if 'Bold' in fname and 'Bookman' in fname: _bf = fname
                elif 'Bookman' in fname: _br = fname
                elif 'Montserrat' in fname: _mt = fname
                elif 'Arial' in fname: _ar = fname
    except Exception:
        pass

    # Styles
    s8 = ParagraphStyle('s8', parent=styles['Normal'], fontSize=8, leading=10, fontName=_br)
    s7 = ParagraphStyle('s7', parent=styles['Normal'], fontSize=7, leading=9, fontName=_br)
    s8b = ParagraphStyle('s8b', parent=styles['Normal'], fontSize=8, leading=10, fontName=_bf)
    lb = ParagraphStyle('lb', parent=styles['Normal'], fontSize=8, leading=11, fontName=_bf, textColor=NAVY)
    vl = ParagraphStyle('vl', parent=styles['Normal'], fontSize=8, leading=11, fontName=_br)

    # ═══ HEADER: Logo + INVOICE box ═══
    logo = Image(logo_path, width=38*mm, height=23*mm) if os.path.exists(logo_path) else ''
    RW = 50*mm
    GAP = 3*mm
    EW = 60*mm
    CW2 = PW - EW - GAP - RW

    title_p = Paragraph('INVOICE', ParagraphStyle('ti', fontSize=18, textColor=W, fontName=_mt, alignment=1, leading=20))
    title_box = Table([[title_p]], colWidths=[RW], rowHeights=[23*mm])
    title_box.setStyle(TableStyle([('BACKGROUND', (0,0), (-1,-1), G), ('VALIGN', (0,0), (-1,-1), 'BOTTOM'),
                                   ('LEFTPADDING', (0,0), (-1,-1), 0), ('RIGHTPADDING', (0,0), (-1,-1), 0), ('BOTTOMPADDING', (0,0), (-1,-1), 2)]))

    h0 = Table([[logo, '', '', title_box]], colWidths=[EW, CW2, GAP, RW])
    h0.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'TOP'), ('SPAN', (0,0), (1,0)),
                             ('LEFTPADDING', (3,0), (3,0), 0), ('RIGHTPADDING', (3,0), (3,0), 0),
                             ('TOPPADDING', (3,0), (3,0), 0), ('BOTTOMPADDING', (3,0), (3,0), 0)]))
    el.append(h0)
    el.append(Spacer(1, 1*mm))

    # ═══ EXPORTER + NOTIFY + INVOICE NO/DATE ═══
    MDG = colors.HexColor('#d5d5d5')
    VLG = colors.HexColor('#f0f0f0')

    right_rows = [
        [Paragraph('<b>Invoice Number</b>', ParagraphStyle('pn', fontSize=10, fontName=_bf, alignment=1))],
        [Paragraph(f'{li.invoice_number}', ParagraphStyle('pv', fontSize=10, fontName=_br, alignment=1))],
        [Paragraph('<b>Date</b>', ParagraphStyle('dl', fontSize=10, fontName=_bf, alignment=1))],
        [Paragraph(f'{li.invoice_date.strftime("%d-%m-%Y")}', ParagraphStyle('dv', fontSize=10, fontName=_br, alignment=1))],
    ]
    rc = Table(right_rows, colWidths=[RW], rowHeights=[7*mm]*4)
    rc.setStyle(TableStyle([('BACKGROUND', (0,0), (0,0), MDG), ('BACKGROUND', (0,1), (0,1), VLG),
                             ('BACKGROUND', (0,2), (0,2), MDG), ('BACKGROUND', (0,3), (0,3), VLG),
                             ('VALIGN', (0,0), (-1,-1), 'MIDDLE'), ('ALIGN', (0,0), (-1,-1), 'CENTER'),
                             ('TOPPADDING', (0,0), (-1,-1), 2), ('BOTTOMPADDING', (0,0), (-1,-1), 2)]))

    rows = [
        [Paragraph('Exporter', s8b), Paragraph('Notify', s8b), '', rc],
        [Paragraph(EXPORTER["name"], s8b), Paragraph(li.notify_company_name or li.client_company_name, s8b), '', ''],
        [Paragraph(EXPORTER["addr1"], s7), Paragraph(li.notify_address or li.client_address or '', s7), '', ''],
        [Paragraph(EXPORTER["addr2"], s7), Paragraph(li.client_pincode, s7), '', ''],
        [Paragraph(EXPORTER["addr3"], s7), Paragraph(li.client_city_state_country, s7), '', ''],
        [Paragraph(f'Contact : {EXPORTER["contact"]}', s7), Paragraph(li.client_tax_number, s7), '', ''],
        [Paragraph(f'Email : {EXPORTER["email"]}', s7), Paragraph(f'Phone : {li.notify_phone or li.client_phone}', s7), '', ''],
        [Paragraph(f'GSTIN : {EXPORTER["gstin"]}', s7), '', '', ''],
        [Paragraph(f'IEC : {EXPORTER["iec"]}', s7), '', '', ''],
    ]
    t1 = Table(rows, colWidths=[EW, CW2, GAP, RW], rowHeights=[7*mm]+[None]*8)
    t1.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (1,0), MDG), ('LINEBELOW', (0,0), (1,0), 0.3, GR),
        ('VALIGN', (0,0), (1,0), 'MIDDLE'), ('SPAN', (3,0), (3,8)),
        ('VALIGN', (0,1), (-1,-1), 'TOP'), ('VALIGN', (3,0), (3,0), 'TOP'),
        ('TOPPADDING', (0,0), (-1,-1), 1), ('BOTTOMPADDING', (0,0), (-1,-1), 1),
        ('LEFTPADDING', (0,0), (1,-1), 3), ('LEFTPADDING', (3,0), (3,0), 0),
        ('RIGHTPADDING', (3,0), (3,0), 0), ('TOPPADDING', (3,0), (3,0), 0), ('BOTTOMPADDING', (3,0), (3,0), 0),
    ]))
    el.append(t1)
    el.append(Spacer(1, 1*mm))

    # ═══ CONSIGNEE — left-aligned to page edge, grey strip same width ═══
    _cn_w = 38*mm + 55*mm  # matches shipment label + value columns
    ov = li.display_overrides if isinstance(li.display_overrides, dict) else {}
    consignee_text = ov.get('_consignee_text', f'To the Order {li.client_city_state_country or li.country_of_final_destination or ""}')
    cn = Table([
        [Paragraph('<b>Consignee</b>', s8b)],
        [Paragraph(consignee_text, s7)],
    ], colWidths=[_cn_w], hAlign='LEFT')
    cn.setStyle(TableStyle([('BACKGROUND', (0,0), (0,0), MDG), ('LINEBELOW', (0,0), (0,0), 0.3, GR),
                             ('VALIGN', (0,0), (-1,-1), 'MIDDLE'), ('TOPPADDING', (0,0), (-1,-1), 1),
                             ('BOTTOMPADDING', (0,0), (-1,-1), 1), ('LEFTPADDING', (0,0), (-1,-1), 3)]))
    el.append(cn)
    el.append(Spacer(1, 2*mm))

    # ═══ SHIPMENT DETAILS + BANK DETAILS ═══
    _rh = 7*mm
    bk_data = {}
    for line in (li.bank_details or '').strip().split('\n'):
        if ':' in line:
            k, v = line.split(':', 1)
            bk_data[k.strip()] = v.strip()

    _sw = PW - 10*mm
    sc = [38*mm, 55*mm, 25*mm, _sw - 38*mm - 55*mm - 25*mm]

    def bk(key):
        for k, v in bk_data.items():
            if key.lower().replace(' ', '') in k.lower().replace(' ', ''):
                return v
        return ''

    def bkv(key):
        v = bk(key)
        return f': {v}' if v else ''

    def sv(val):
        return val if val else ''

    grid = [
        [Paragraph('<b>Country of Origin</b>', lb), Paragraph(sv(li.country_of_origin), vl),
         Paragraph('<b>Bank Details</b>', s8b), ''],
        [Paragraph('<b>Port of Loading</b>', lb), Paragraph(sv(li.port_of_loading), vl),
         Paragraph('<b>Bank Name</b>', lb), Paragraph(bkv("Bank name"), vl)],
        [Paragraph('<b>Vessel / Flight No</b>', lb), Paragraph(sv(li.vessel_flight_no), vl),
         Paragraph('<b>Branch name</b>', lb), Paragraph(bkv("Branch name"), vl)],
        [Paragraph('<b>Port of Discharge</b>', lb), Paragraph(sv(li.port_of_discharge), vl),
         Paragraph('<b>Beneficiary</b>', lb), Paragraph(bkv("Beneficiary"), vl)],
        [Paragraph('<b>Country of Final Dest.</b>', lb), Paragraph(sv(li.country_of_final_destination), vl),
         Paragraph('<b>IFSC Code</b>', lb), Paragraph(bkv("IFSC"), vl)],
        [Paragraph('<b>Incoterms</b>', lb), Paragraph(sv(li.terms_of_delivery), vl),
         Paragraph('<b>Swift Code</b>', lb), Paragraph(bkv("Swift"), vl)],
        [Paragraph('<b>Terms of Trade</b>', lb), Paragraph(sv(li.payment_terms), vl),
         Paragraph('<b>A/C No.</b>', lb), Paragraph(bkv("A/C No"), vl)],
        [Paragraph('<b>Buyer Reference</b>', lb), Paragraph(sv(li.buyer_reference), vl),
         Paragraph('<b>A/C Type</b>', lb), Paragraph(bkv("A/C Type"), vl)],
        [Paragraph('<b>Exchange Rate per USD</b>', lb), Paragraph(f'Rs.{li.exchange_rate}' if li.exchange_rate else '', vl), '', ''],
    ]
    st = Table(grid, colWidths=sc, rowHeights=[_rh]*9)
    st.setStyle(TableStyle([('FONTSIZE', (0,0), (-1,-1), 7), ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                             ('TOPPADDING', (0,0), (-1,-1), 1), ('BOTTOMPADDING', (0,0), (-1,-1), 1),
                             ('LEFTPADDING', (0,0), (-1,-1), 3), ('SPAN', (2,0), (3,0))]))

    sidebar = RotatedText('SHIPMENT  DETAILS', 10*mm, 9*_rh, G, 9, _mt)
    combo = Table([[sidebar, st]], colWidths=[10*mm, _sw])
    combo.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                                ('LEFTPADDING', (0,0), (-1,-1), 0), ('RIGHTPADDING', (0,0), (-1,-1), 0),
                                ('TOPPADDING', (0,0), (-1,-1), 0), ('BOTTOMPADDING', (0,0), (-1,-1), 0)]))
    el.append(combo)
    el.append(Spacer(1, 1*mm))

    # ═══ PACKING DETAILS TITLE ═══
    pd_title = Table([[Paragraph('PACKING DETAILS', ParagraphStyle('pd', fontSize=18, textColor=colors.HexColor('#aaaaaa'), alignment=2, fontName=_ar))]], colWidths=[PW])
    el.append(pd_title)
    el.append(Spacer(1, 1*mm))

    # ═══ PRODUCT TABLE ═══
    CW = [30*mm, 30*mm, 38*mm, 16*mm, 22*mm, 27*mm, 27*mm]
    hs = ParagraphStyle('hs', fontSize=7, fontName=_bf, textColor=W, leading=9)
    hsr = ParagraphStyle('hsr', fontSize=7, fontName=_bf, textColor=W, leading=9, alignment=2)
    hsc = ParagraphStyle('hsc', fontSize=7, fontName=_bf, textColor=W, leading=9, alignment=1)
    hdr = [Paragraph('Product Name', hs), Paragraph('No. & Kind of<br/>Packages', hs),
           Paragraph('Product Details', hs), Paragraph('Quantity', hsc),
           Paragraph('Price/Kg', hsr), Paragraph('Amount in<br/>USD', hsr), Paragraph('Amount in<br/>INR', hsr)]

    _bs = ParagraphStyle('bs', fontSize=7, leading=9, fontName=_br)
    data = [hdr]
    xrate = float(li.exchange_rate) if li.exchange_rate else 0
    for item in li.items.all():
        inr_val = float(item.amount_usd) * xrate if xrate else 0
        data.append([
            Paragraph(item.product_name or '', _bs), Paragraph(item.packages_description or '', _bs),
            Paragraph(item.description_of_goods or '', _bs),
            f'{item.quantity:,.0f} {item.unit}'.strip(), f'{item.unit_price:,.2f}',
            f'${item.amount_usd:,.2f}', f'Rs.{inr_val:,.2f}' if xrate else '-',
        ])

    it = Table(data, colWidths=CW)
    it.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), G), ('TEXTCOLOR', (0,0), (-1,0), W),
        ('FONT', (0,1), (-1,-1), _br), ('FONTSIZE', (0,1), (-1,-1), 8),
        ('ALIGN', (0,1), (2,-1), 'LEFT'), ('ALIGN', (3,1), (3,-1), 'CENTER'), ('ALIGN', (4,1), (-1,-1), 'RIGHT'),
        ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
        ('TOPPADDING', (0,0), (-1,0), 4), ('BOTTOMPADDING', (0,0), (-1,0), 4),
        ('TOPPADDING', (0,1), (-1,-1), 3), ('BOTTOMPADDING', (0,1), (-1,-1), 3),
        ('LEFTPADDING', (0,0), (-1,-1), 5), ('RIGHTPADDING', (0,0), (-1,-1), 5),
    ]))
    el.append(it)

    # ═══ TOTALS ═══
    ts_g = ParagraphStyle('tsg', fontSize=8, textColor=G, fontName=_bf, alignment=2)
    total_usd = sum(float(i.amount_usd) for i in li.items.all())
    total_inr = total_usd * xrate
    frt = float(li.freight or 0)
    ins = float(li.insurance or 0)
    disc = float(li.discount or 0)
    disc_inr = disc * xrate
    sub_usd = total_usd
    sub_inr = sub_usd * xrate
    igst_r = float(li.igst_rate or 0)
    igst_a = (sub_inr + (frt * xrate) + (ins * xrate)) * igst_r / 100
    grand_inr = sub_inr + (frt * xrate) + (ins * xrate) + igst_a - disc_inr

    _spacer = CW[0] + CW[1] + CW[2]
    _label = CW[3] + CW[4]
    _usd = CW[5]
    _inr = CW[6]
    tcw = [_spacer, _label, _usd, _inr]

    # Use wider columns for totals to prevent cutoff
    tcw2 = [_spacer, _label, _usd + 5*mm, _inr + 5*mm]

    totals_data = [
        ['', 'Discount', f'${disc:,.2f}', f'Rs.{disc_inr:,.2f}'],
        ['', 'Sub Total', f'${sub_usd:,.2f}', f'Rs.{sub_inr:,.2f}' if xrate else '-'],
    ]
    if igst_r:
        totals_data.append(['', f'GST {igst_r}%', '', f'Rs.{igst_a:,.2f}' if xrate else '-'])
    grand_str = f'Rs.{grand_inr:,.2f}' if xrate else '-'
    totals_data.append(['', Paragraph('<b>Grand Total</b>', ts_g), '', Paragraph(f'<b>{grand_str}</b>', ts_g)])

    tot = Table(totals_data, colWidths=tcw2)
    tot.setStyle(TableStyle([('ALIGN', (0,0), (-1,-1), 'RIGHT'), ('FONT', (0,0), (-1,-1), _bf), ('FONTSIZE', (0,0), (-1,-1), 7),
                              ('TOPPADDING', (0,0), (-1,-1), 2), ('BOTTOMPADDING', (0,0), (-1,-1), 2),
                              ('RIGHTPADDING', (0,0), (-1,-1), 5), ('LINEBELOW', (1,-1), (-1,-1), 0.5, G)]))
    el.append(tot)
    el.append(Spacer(1, 1*mm))

    # ═══ ADDITIONAL DETAILS ═══
    ad_style = ParagraphStyle('ad', fontSize=7, leading=9, fontName=_br)
    ad_bold = ParagraphStyle('adb', fontSize=7, leading=9, fontName=_bf)
    el.append(Paragraph('<b><u>Additional Details</u></b>', ad_bold))
    el.append(Paragraph(f'<b>FOB</b> - ${total_usd:,.2f}  <b>Shipping &amp; Forwarding</b> - !', ad_style))
    el.append(Spacer(1, 1*mm))

    # ═══ AMOUNT IN WORDS ═══
    TW = sum(CW)
    amount_words = li.amount_in_words
    if not amount_words and grand_inr > 0:
        from .pi_service import _number_to_words
        amount_words = _number_to_words(grand_inr, 'INR')
    ac_style = ParagraphStyle('ac', fontSize=9, fontName=_bf, alignment=1)
    ac = Table([[Paragraph(f'Amount In Words : {amount_words or ""}', ac_style)]], colWidths=[TW])
    ac.setStyle(TableStyle([('BACKGROUND', (0,0), (-1,-1), colors.HexColor('#dce9d0')),
                             ('TOPPADDING', (0,0), (-1,-1), 4), ('BOTTOMPADDING', (0,0), (-1,-1), 4)]))
    el.append(ac)
    el.append(Spacer(1, 2*mm))

    # ═══ DECLARATION + SEAL ═══
    seal = Image(seal_path, width=18*mm, height=18*mm) if os.path.exists(seal_path) else ''
    sign = Image(sign_path, width=20*mm, height=10*mm) if os.path.exists(sign_path) else ''

    decl_style = ParagraphStyle('decl', fontSize=7, leading=9, fontName=_br)
    decl_block = Table([
        [Paragraph('<b>Declaration :</b>', decl_style)],
        [Paragraph('We Declare that this Invoice shows the Actual Price of the Goods described and that all particulars are true and correct', decl_style)],
        [Paragraph('<b>E. &amp; O.E</b>', decl_style)],
    ], colWidths=[100*mm])
    decl_block.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'TOP'), ('LEFTPADDING', (0,0), (-1,-1), 0),
                                     ('TOPPADDING', (0,0), (-1,-1), 1), ('BOTTOMPADDING', (0,0), (-1,-1), 1)]))

    auth_top = Paragraph('<b>For Kriya Biosys Private Limited</b>', ParagraphStyle('fk', fontSize=9, alignment=1, fontName=_bf))
    seal_sign = Table([[seal, sign]], colWidths=[22*mm, 25*mm])
    seal_sign.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'BOTTOM'), ('ALIGN', (0,0), (-1,-1), 'CENTER')]))
    auth_bottom = Paragraph('Authorised Signature', ParagraphStyle('as3', fontSize=9, alignment=1, fontName=_br))

    right_block = Table([[auth_top], [seal_sign], [auth_bottom]], colWidths=[70*mm])
    right_block.setStyle(TableStyle([('ALIGN', (0,0), (-1,-1), 'CENTER'), ('VALIGN', (0,0), (-1,-1), 'MIDDLE'),
                                      ('TOPPADDING', (0,0), (-1,-1), 2), ('BOTTOMPADDING', (0,0), (-1,-1), 2)]))

    decl_row = Table([[decl_block, right_block]], colWidths=[TW - 72*mm, 72*mm])
    decl_row.setStyle(TableStyle([('VALIGN', (0,0), (-1,-1), 'TOP')]))
    el.append(decl_row)
    el.append(Spacer(1, 1*mm))

    # ═══ FOOTER ═══
    el.append(Paragraph('" Go Organic ! Save Planet ! "', ParagraphStyle('m', fontSize=8, alignment=1, fontName=_bf)))

    doc.build(el)
    buffer.seek(0)
    return buffer


def send_li_email(li, user):
    """Generate PDF and send to client via email."""
    from communications.models import EmailAccount, Communication
    from communications.services import EmailService, get_client_email_recipients
    from django.core.files.base import ContentFile

    contact_email, contact, cc_string = get_client_email_recipients(li.client)
    if not contact_email:
        raise ValueError(f'No email for {li.client_company_name}')

    email_account = EmailAccount.objects.filter(is_active=True).first()
    if not email_account:
        raise ValueError('No email account configured')

    pdf_buffer = generate_li_pdf(li)
    pdf_bytes = pdf_buffer.read()
    li.pdf_file.save(f'{li.invoice_number.replace("/", "-")}.pdf', ContentFile(pdf_bytes), save=True)

    subject = f'Logistics Invoice {li.invoice_number} - Kriya Biosys'
    body_html = f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;">
        <h2 style="color:#4F7F2A;">Logistics Invoice</h2>
        <p>Dear {contact.name if contact else "Sir/Madam"},</p>
        <p>Please find attached our Logistics Invoice <b>{li.invoice_number}</b> dated {li.invoice_date.strftime('%B %d, %Y')}.</p>
        <p>Please review and confirm. Looking forward to your response.</p>
        <p>Best regards,<br/><b>Kriya Biosys Private Limited</b><br/><i>"Go Organic! Save Planet!"</i></p>
    </div>
    """

    from io import BytesIO
    pdf_file = BytesIO(pdf_bytes)
    pdf_file.name = f'LI_{li.invoice_number.replace("/", "-")}.pdf'

    from communications.services import get_thread_headers
    in_reply_to, references, orig_subj = get_thread_headers(li.client, getattr(li, 'source_communication', None))
    if orig_subj:
        subject = f'Re: {orig_subj}' if not orig_subj.startswith('Re:') else orig_subj

    EmailService.send_email(email_account=email_account, to=contact_email, subject=subject, body_html=body_html,
                            attachments=[pdf_file], cc=cc_string or None, in_reply_to=in_reply_to, references=references)

    li.status = 'sent'
    li.save(update_fields=['status'])

    Communication.objects.create(client=li.client, contact=contact, user=user, comm_type='email', direction='outbound',
                                 subject=subject, body=body_html, status='sent', email_account=email_account,
                                 external_email=contact_email, email_cc=cc_string)

    return contact_email
