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
    for item in order.items.all():
        ProformaInvoiceItem.objects.create(
            pi=pi,
            product_name=item.product_name,
            packages_description=f'{int(item.quantity)} {item.unit} Container Packing',
            description_of_goods=item.description or item.product_name,
            quantity=item.quantity,
            unit=item.unit,
            unit_price=item.unit_price,
            total_price=item.total_price,
        )

    return pi


def generate_pi_pdf(pi):
    """Generate PDF matching the Kriya Biosys PI template with logo, seal, sign."""
    import os
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from django.conf import settings

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, topMargin=15*mm, bottomMargin=15*mm,
                            leftMargin=12*mm, rightMargin=12*mm)
    styles = getSampleStyleSheet()
    elements = []

    green = colors.HexColor('#4a7c2e')
    dark = colors.HexColor('#333333')

    # Image paths
    img_dir = os.path.join(settings.BASE_DIR, 'static', 'images')
    logo_path = os.path.join(img_dir, 'logo.png')
    seal_path = os.path.join(img_dir, 'seal.png')
    sign_path = os.path.join(img_dir, 'sign.png')

    # Register Montserrat font if available, fallback to Helvetica-Bold
    try:
        from reportlab.pdfbase import pdfmetrics
        from reportlab.pdfbase.ttfonts import TTFont
        font_path = os.path.join(img_dir, 'Montserrat-Bold.ttf')
        if os.path.exists(font_path):
            pdfmetrics.registerFont(TTFont('Montserrat-Bold', font_path))
            title_font = 'Montserrat-Bold'
        else:
            title_font = 'Helvetica-Bold'
    except Exception:
        title_font = 'Helvetica-Bold'

    title_style = ParagraphStyle('PITitle', parent=styles['Title'], fontSize=20,
                                  textColor=colors.white, alignment=1, fontName=title_font,
                                  leading=26, spaceBefore=4*mm, spaceAfter=4*mm)
    header_style = ParagraphStyle('Header', parent=styles['Normal'], fontSize=8, leading=10)
    small = ParagraphStyle('Small', parent=styles['Normal'], fontSize=7, leading=9)

    # ── Header: Logo left, Green title box right (matching template exactly) ──
    # Logo: maintain aspect ratio (458x281 original)
    logo_w, logo_h = 40*mm, 24.5*mm  # proportional
    logo_img = Image(logo_path, width=logo_w, height=logo_h) if os.path.exists(logo_path) else ''

    # Green box with PROFORMA INVOICE
    from reportlab.platypus import TableStyle as TS
    title_cell = Paragraph('PROFORMA<br/>INVOICE', title_style)
    title_table = Table([[title_cell]], colWidths=[55*mm], rowHeights=[30*mm])
    title_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), green),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
    ]))

    header_data = [[logo_img, '', title_table]]
    ht0 = Table(header_data, colWidths=[50*mm, 80*mm, 55*mm])
    ht0.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (2, 0), (2, 0), 'RIGHT'),
    ]))
    elements.append(ht0)
    elements.append(Spacer(1, 3*mm))

    # ── Exporter + Consignee + Invoice Number ──
    header_data = [
        [Paragraph('<b>Exporter</b>', header_style),
         Paragraph('<b>Consignee</b>', header_style),
         Paragraph('<b>PRO. Invoice Number</b>', header_style)],
        [Paragraph(f'<b>{EXPORTER["name"]}</b>', header_style),
         Paragraph(f'<b>{pi.client_company_name}</b>', header_style),
         Paragraph(f'<b>{pi.invoice_number}</b>', header_style)],
        [Paragraph(EXPORTER['address'].replace('\n', '<br/>'), small),
         Paragraph(f'{pi.client_tax_number}<br/>{pi.client_address}<br/>{pi.client_pincode}', small),
         ''],
        [Paragraph(f'GSTIN : {EXPORTER["gstin"]}', small),
         Paragraph(f'{pi.client_city_state_country}', small),
         Paragraph(f'<b>Date</b>', header_style)],
        [Paragraph(f'EMAIL : {EXPORTER["email"]}', small),
         Paragraph(f'Tel: {pi.client_phone}', small),
         Paragraph(f'{pi.invoice_date.strftime("%d-%m-%Y")}', header_style)],
        [Paragraph(f'IEC : {EXPORTER["iec"]}', small), '', ''],
    ]
    ht = Table(header_data, colWidths=[60*mm, 75*mm, 50*mm])
    ht.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
    ]))
    elements.append(ht)
    elements.append(Spacer(1, 3*mm))

    # ── Shipment Details with vertical green sidebar label ──
    ship_inner = [
        ['Country of Origin', pi.country_of_origin, 'Country of Final Destination', pi.country_of_final_destination],
        ['Port of Loading', pi.port_of_loading or '', 'Port of Discharge', pi.port_of_discharge or ''],
        ['Vessel / Flight No', pi.vessel_flight_no or '', 'Final Destination', pi.final_destination or ''],
        ['Terms of Trade', pi.terms_of_trade or '', 'Terms of Delivery', pi.terms_of_delivery or ''],
        ['Buyer Reference', pi.buyer_reference or '', '', ''],
    ]
    ship_table = Table(ship_inner, colWidths=[38*mm, 46*mm, 42*mm, 46*mm])
    ship_table.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.5, colors.grey),
        ('FONTSIZE', (0, 0), (-1, -1), 8),
        ('FONT', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONT', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))

    # Vertical rotated "SHIPMENT DETAILS" green sidebar using a Drawing
    from reportlab.graphics.shapes import Drawing, String, Rect
    from reportlab.graphics import renderPDF
    from reportlab.platypus import Flowable

    class RotatedText(Flowable):
        """A flowable that draws rotated text in a green background."""
        def __init__(self, text, width, height, bg_color, font_size=8):
            Flowable.__init__(self)
            self.text = text
            self.width = width
            self.height = height
            self.bg_color = bg_color
            self.font_size = font_size

        def draw(self):
            self.canv.saveState()
            self.canv.setFillColor(self.bg_color)
            self.canv.rect(0, 0, self.width, self.height, fill=1, stroke=0)
            self.canv.setFillColor(colors.white)
            self.canv.setFont('Helvetica-Bold', self.font_size)
            self.canv.translate(self.width / 2, self.height / 2)
            self.canv.rotate(90)
            self.canv.drawCentredString(0, -self.font_size / 3, self.text)
            self.canv.restoreState()

    sidebar = RotatedText('SHIPMENT  DETAILS', 10*mm, 32*mm, green, 8)

    wrapper = Table([[sidebar, ship_table]], colWidths=[10*mm, 175*mm])
    wrapper.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (0, 0), 0),
        ('RIGHTPADDING', (0, 0), (0, 0), 0),
        ('TOPPADDING', (0, 0), (0, 0), 0),
        ('BOTTOMPADDING', (0, 0), (0, 0), 0),
    ]))
    elements.append(wrapper)
    elements.append(Spacer(1, 4*mm))

    # ── Packing Details ──
    elements.append(Paragraph('<b>PACKING DETAILS</b>', ParagraphStyle('PD', parent=styles['Normal'],
                              fontSize=9, textColor=colors.white, backColor=green, spaceAfter=2*mm)))

    items_header = ['Product Details', 'No. & Kind of Packages', 'Description of Goods',
                    'Quantity', 'Price/' + pi.items.first().unit if pi.items.exists() else 'Price', 'Amount']
    items_data = [items_header]

    for item in pi.items.all():
        items_data.append([
            item.product_name,
            item.packages_description,
            item.description_of_goods,
            f'{item.quantity:,.0f}',
            f'{item.unit_price:,.2f}',
            f'{item.total_price:,.2f}',
        ])

    items_data.append(['', '', '', '', 'Total', f'{pi.total:,.2f}'])
    items_data.append(['', '', f'Amount Chargeable: {pi.currency} {pi.amount_in_words}', '', '', ''])

    it = Table(items_data, colWidths=[30*mm, 40*mm, 45*mm, 22*mm, 22*mm, 26*mm])
    it.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -2), 0.5, colors.grey),
        ('BACKGROUND', (0, 0), (-1, 0), green),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTSIZE', (0, 0), (-1, -1), 7),
        ('FONT', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('ALIGN', (3, 1), (-1, -1), 'RIGHT'),
        ('FONT', (-2, -2), (-1, -2), 'Helvetica-Bold'),
    ]))
    elements.append(it)
    elements.append(Spacer(1, 4*mm))

    # ── Bank Details left | Seal center-right | Auth + Sign right ──
    bank_text = pi.bank_details.replace('\n', '<br/>')
    bank_para = Paragraph(f'<b>Bank Details</b><br/>{bank_text}', small)

    seal_img = Image(seal_path, width=22*mm, height=22*mm) if os.path.exists(seal_path) else ''
    sign_img = Image(sign_path, width=25*mm, height=12*mm) if os.path.exists(sign_path) else ''

    auth_style = ParagraphStyle('Auth', parent=styles['Normal'], fontSize=8, alignment=2)
    sign_style = ParagraphStyle('AS', parent=styles['Normal'], fontSize=7, alignment=2)

    # Build right side: auth text + seal + sign stacked
    right_data = [
        [Paragraph('<b>For Kriya Biosys Private Limited</b>', auth_style)],
        [seal_img],
        [sign_img],
        [Paragraph('Authorized Signatory', sign_style)],
    ]
    right_table = Table(right_data, colWidths=[55*mm])
    right_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 1),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
    ]))

    footer_data = [[bank_para, right_table]]
    ft = Table(footer_data, colWidths=[120*mm, 65*mm])
    ft.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
    ]))
    elements.append(ft)
    elements.append(Spacer(1, 4*mm))

    # ── Declaration ──
    elements.append(Paragraph(
        '<b>Declaration:</b> We declare that this Invoice shows the Actual Price of the Goods '
        'described and that all particulars are true and correct <b>E. & O.E</b>',
        ParagraphStyle('Decl', parent=styles['Normal'], fontSize=7, alignment=1)))
    elements.append(Paragraph('" Go Organic ! Save Planet ! "',
                              ParagraphStyle('Motto', parent=styles['Normal'], fontSize=7, alignment=1,
                                            textColor=green)))

    doc.build(elements)
    buffer.seek(0)
    return buffer


def send_pi_email(pi, user):
    """Generate PDF, send to client, update status."""
    from communications.models import EmailAccount, Communication
    from communications.services import EmailService
    from django.core.files.base import ContentFile

    # Get contact email
    contact = pi.client.contacts.filter(is_deleted=False).order_by('-is_primary').first()
    if not contact or not contact.email:
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
        email_account=email_account, to=contact.email,
        subject=subject, body_html=body_html,
        attachments=[pdf_file],
    )

    # Update status
    pi.status = 'sent'
    pi.save(update_fields=['status'])

    # Log communication
    Communication.objects.create(
        client=pi.client, contact=contact, user=user,
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
