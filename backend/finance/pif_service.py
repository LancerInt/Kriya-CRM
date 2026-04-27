"""
Packing Instructions Form (PIF) service — auto-fill from order/order_item + PDF generation.
Matches the Kriya Biosys PIF template layout shown in reference image.
"""
import io
import os
import logging
from datetime import date
from django.conf import settings

logger = logging.getLogger(__name__)


def _next_pif_number(order):
    """PIF-<order#>-<seq> where seq is 1-based across the order's PIFs."""
    from finance.models import PackingInstructionForm
    count = PackingInstructionForm.objects.filter(order=order).count() + 1
    order_no = (order.order_number or '').replace('ORD-', '')
    return f'PIF-{order_no}-{count}'


def create_pif_from_order_item(order_item, user):
    """Create a PIF draft from an OrderItem, pre-filling reasonable defaults."""
    from finance.models import PackingInstructionForm

    order = order_item.order
    client = order.client

    pif = PackingInstructionForm.objects.create(
        pif_number=_next_pif_number(order),
        order=order,
        order_item=order_item,
        client=client,
        po_no=order.po_number or '',
        pif_date=date.today(),
        product_name=order_item.product_name or '',
        product_description=order_item.client_product_name or '',
        packing_description='',
        quantity=f'{order_item.quantity} {order_item.unit}'.strip(),
        notes='Kindly follow the packing instructions as mentioned in the form. '
              'Please let us know for any clarification and also do let us know '
              'if any other packing materials are required.',
        container_left={
            'type': '',
            'bottle_colour': '',
            'cap_colour': '',
            'cap_type': '',
            'measuring_cups': '',
        },
        container_right={
            'colour': '',
            'box_thickness': '',
            'carton_box_label': '',
            'batch_sticker': '',
            'batch_no': '',
        },
        packing_sections=[
            {'label': '100 ml', 'quantity_left': {}, 'accessories_right': {}},
            {'label': '500 ml', 'quantity_left': {}, 'accessories_right': {}},
            {'label': '1 Litre', 'quantity_left': {}, 'accessories_right': {}},
        ],
        footer_note=('Please check the below details and follow the instructions '
                     'as given above packing list and materials needs to be checked '
                     'and approved by Purchase Department, Inspection Team and Factory Incharge.'),
        created_by=user,
    )
    return pif


# ── PDF Generation ──
_LEFT_FIELDS_CONTAINER = [
    ('type', 'Type'),
    ('bottle_colour', 'Bottle Colour'),
    ('cap_colour', 'Cap Colour'),
    ('cap_type', 'Cap Type'),
    ('measuring_cups', 'Measuring Cups'),
]
_RIGHT_FIELDS_CONTAINER = [
    ('colour', 'Colour'),
    ('box_thickness', 'Box Thickness'),
    ('carton_box_label', 'Carton Box Label/Design'),
    ('batch_sticker', 'Batch Sticker'),
    ('batch_no', 'Batch No.'),
]
_LEFT_FIELDS_QTY = [
    ('total_quantity', 'Total Quantity'),
    ('bottles_caps', 'No. of Bottles/Caps'),
    ('liters_per_box', 'No. of Liters per Box'),
    ('carton_boxes', 'No. of Carton Box'),
]
_RIGHT_FIELDS_ACC = [
    ('label_quantity', 'Label/Quantity'),
    ('label_type', 'Label Type'),
    ('label_size', 'Label Size'),
    ('leaflet_quantity', 'Leaflet/Quantity'),
    ('sleeves_quantity', 'Sleeves/Quantity'),
    ('partitions', 'Partitions'),
    ('pads', 'Pads'),
    ('box_thickness', 'Box Thickness'),
]


def generate_pif_pdf(pif):
    """Generate a PDF for the given PIF, matching the Kriya Biosys template."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.units import mm
    from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image, KeepInFrame
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    buffer = io.BytesIO()
    pdf_title = f'PIF {pif.pif_number} - {pif.product_name or ""}'
    TOP_M = 8 * mm
    BOT_M = 8 * mm
    LR_M = 10 * mm
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        topMargin=TOP_M, bottomMargin=BOT_M,
        leftMargin=LR_M, rightMargin=LR_M,
        title=pdf_title, author='Kriya Biosys Private Limited',
    )

    styles = getSampleStyleSheet()
    G = colors.HexColor('#4e8a2d')      # Kriya green
    BLUE = colors.HexColor('#1f4e79')   # section heading blue
    GREY = colors.HexColor('#dedede')
    BLACK = colors.black

    img_dir = os.path.join(settings.BASE_DIR, 'static', 'images')
    logo_path = os.path.join(img_dir, 'logo.png')
    seal_path = os.path.join(img_dir, 'seal.png')
    sign_path = os.path.join(img_dir, 'sign.png')

    # Fonts
    _bf, _br = 'Helvetica-Bold', 'Helvetica'
    try:
        bos_bold = os.path.join(img_dir, 'BookmanOldStyle-Bold.ttf')
        bos_reg = os.path.join(img_dir, 'BookmanOldStyle-Regular.ttf')
        if os.path.exists(bos_bold):
            pdfmetrics.registerFont(TTFont('BookmanOldStyle-Bold', bos_bold))
            _bf = 'BookmanOldStyle-Bold'
        if os.path.exists(bos_reg):
            pdfmetrics.registerFont(TTFont('BookmanOldStyle', bos_reg))
            _br = 'BookmanOldStyle'
    except Exception:
        pass

    s8 = ParagraphStyle('s8', parent=styles['Normal'], fontSize=7.5, leading=9.5, fontName=_br)
    s8b = ParagraphStyle('s8b', parent=styles['Normal'], fontSize=7.5, leading=9.5, fontName=_bf)
    s7 = ParagraphStyle('s7', parent=styles['Normal'], fontSize=6.5, leading=8, fontName=_br)
    s_title = ParagraphStyle('s_title', parent=styles['Normal'], fontSize=13, leading=16, fontName=_bf, alignment=1)
    s_sec = ParagraphStyle('s_sec', parent=styles['Normal'], fontSize=8.5, leading=10, fontName=_bf, textColor=BLUE)

    PW = 190 * mm  # page content width

    el = []

    # ── Header: logo | title | meta ──
    logo = Image(logo_path, width=26 * mm, height=15 * mm) if os.path.exists(logo_path) else Paragraph('', s8)
    left_cell = Table([[logo]], colWidths=[50 * mm])
    left_cell.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))

    title_p = Paragraph('Packing Instructions Form', s_title)

    pif_date_str = pif.pif_date.strftime('%d/%m/%Y') if pif.pif_date else ''
    meta_tbl = Table([
        [Paragraph(f'<b>PO No</b> : {pif.po_no or "-"}', s8)],
        [Paragraph(f'<b>PI Form No</b> : {pif.pif_number}', s8)],
        [Paragraph(f'<b>Date</b> : {pif_date_str}', s8)],
    ], colWidths=[50 * mm])
    meta_tbl.setStyle(TableStyle([
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 1),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
    ]))

    header = Table([[left_cell, title_p, meta_tbl]], colWidths=[50 * mm, PW - 100 * mm, 50 * mm])
    header.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('VALIGN', (1, 0), (1, 0), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    el.append(header)
    el.append(Spacer(1, 1.5 * mm))
    el.append(Table([['']], colWidths=[PW], rowHeights=[0.5],
                    style=TableStyle([('LINEBELOW', (0, 0), (-1, -1), 0.6, BLACK)])))
    el.append(Spacer(1, 1.5 * mm))

    # ── Helper to render a 2-col heading row and a 2-col key/value block ──
    def section_heading_row(left_text, right_text=None):
        left_para = Paragraph(left_text, s_sec)
        right_para = Paragraph(right_text, s_sec) if right_text else ''
        t = Table([[left_para, right_para]], colWidths=[PW / 2, PW / 2])
        t.setStyle(TableStyle([
            ('LINEBELOW', (0, 0), (-1, -1), 0.4, BLUE),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
            ('TOPPADDING', (0, 0), (-1, -1), 1),
        ]))
        return t

    def kv_pair(label, value):
        return [Paragraph(label, s8), Paragraph(str(value or ''), s8)]

    def kv_block(fields, source):
        rows = [kv_pair(label, source.get(key, '')) for key, label in fields]
        t = Table(rows, colWidths=[35 * mm, (PW / 2) - 35 * mm])
        t.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 2),
            ('TOPPADDING', (0, 0), (-1, -1), 0.5),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0.5),
        ]))
        return t

    def two_col(left, right):
        t = Table([[left, right]], colWidths=[PW / 2, PW / 2])
        t.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        return t

    # ── Product Details / Notes ──
    el.append(section_heading_row('Product Details', 'Notes'))
    product_rows = [
        kv_pair('Product Name', pif.product_name),
        kv_pair('Product Description', pif.product_description),
        kv_pair('Packing Description', pif.packing_description),
        kv_pair('Quantity', pif.quantity),
    ]
    product_tbl = Table(product_rows, colWidths=[42 * mm, (PW / 2) - 42 * mm])
    product_tbl.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 2),
        ('TOPPADDING', (0, 0), (-1, -1), 1),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
    ]))
    notes_box = Table([[Paragraph(pif.notes or '', s8)]], colWidths=[(PW / 2) - 4 * mm], rowHeights=[22 * mm])
    notes_box.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 0.4, GREY),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
    ]))
    notes_wrap = Table([[notes_box]], colWidths=[PW / 2])
    notes_wrap.setStyle(TableStyle([
        ('LEFTPADDING', (0, 0), (-1, -1), 2 * mm),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
    ]))
    el.append(two_col(product_tbl, notes_wrap))
    el.append(Spacer(1, 1.5 * mm))

    # ── Container / Carton Box ──
    el.append(section_heading_row('Container', 'Carton Box'))
    el.append(two_col(
        kv_block(_LEFT_FIELDS_CONTAINER, pif.container_left or {}),
        kv_block(_RIGHT_FIELDS_CONTAINER, pif.container_right or {}),
    ))
    el.append(Spacer(1, 1.5 * mm))

    # ── Repeating Packing Sections ──
    for section in (pif.packing_sections or []):
        label = section.get('label') or ''
        el.append(section_heading_row(
            f'Quantity – {label} Packing',
            f'Container Accessories – {label}',
        ))
        el.append(two_col(
            kv_block(_LEFT_FIELDS_QTY, section.get('quantity_left', {}) or {}),
            kv_block(_RIGHT_FIELDS_ACC, section.get('accessories_right', {}) or {}),
        ))
        el.append(Spacer(1, 1 * mm))

    # ── Footer ──
    el.append(Spacer(1, 2 * mm))
    el.append(Table([['']], colWidths=[PW], rowHeights=[0.5],
                    style=TableStyle([('LINEABOVE', (0, 0), (-1, -1), 0.4, BLACK)])))
    el.append(Spacer(1, 1 * mm))
    el.append(Paragraph(pif.footer_note or '', s8))
    el.append(Spacer(1, 4 * mm))

    # Sign + Seal stamp block — used in the first signature column
    def _make_sign_seal_cell():
        sign = Image(sign_path, width=20 * mm, height=10 * mm) if os.path.exists(sign_path) else ''
        seal = Image(seal_path, width=14 * mm, height=14 * mm) if os.path.exists(seal_path) else ''
        if not sign and not seal:
            return ''
        inner = Table([[sign, seal]], colWidths=[22 * mm, 16 * mm])
        inner.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'BOTTOM'),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('LEFTPADDING', (0, 0), (-1, -1), 0),
            ('RIGHTPADDING', (0, 0), (-1, -1), 0),
            ('TOPPADDING', (0, 0), (-1, -1), 0),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
        ]))
        return inner

    sig_col_w = PW / 3
    sig_label = Paragraph('Seal & Signature', ParagraphStyle('slbl', parent=s7, alignment=1))
    sig_line = Paragraph('_________________________', ParagraphStyle('sline', parent=s7, alignment=1))
    sig_row = Table([
        [_make_sign_seal_cell(), '', ''],
        [sig_line, sig_line, sig_line],
        [sig_label, sig_label, sig_label],
    ], colWidths=[sig_col_w, sig_col_w, sig_col_w])
    sig_row.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
    ]))
    el.append(sig_row)

    # Force single A4 page — shrink content uniformly if it overflows
    page_w, page_h = A4
    frame_w = page_w - 2 * LR_M
    frame_h = page_h - TOP_M - BOT_M
    wrapped = KeepInFrame(frame_w, frame_h, el, mode='shrink')
    doc.build([wrapped])
    buffer.seek(0)
    return buffer
